import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import WebSocket, { WebSocketServer } from 'ws';

import { resolveOpenclawConfigCandidates } from './openclawPaths.js';
import { inferSpokenMetadataFromContent } from './spokenMetadata.js';

const DEFAULT_GATEWAY_HOST = '127.0.0.1';
const DEFAULT_GATEWAY_PORT = 18789;
const PRIMER_MARKER = '[oomi:primer:v1]';

function trimString(value, fallback = '') {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function readJsonSafe(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function resolveGatewayConfig() {
  const config = resolveOpenclawConfigCandidates()
    .map((candidate) => readJsonSafe(candidate))
    .find((entry) => entry && typeof entry === 'object');

  const gateway = config?.gateway && typeof config.gateway === 'object' ? config.gateway : {};
  const auth = gateway.auth && typeof gateway.auth === 'object' ? gateway.auth : {};
  const port = Number(gateway.port);
  return {
    host: trimString(process.env.OPENCLAW_GATEWAY_HOST, DEFAULT_GATEWAY_HOST),
    port: Number.isFinite(port) && port > 0 ? Math.floor(port) : DEFAULT_GATEWAY_PORT,
    token: trimString(process.env.OPENCLAW_GATEWAY_TOKEN, trimString(auth.token)),
    password: trimString(process.env.OPENCLAW_GATEWAY_PASSWORD, trimString(auth.password)),
  };
}

function chunkText(text, maxChunkLength = 32) {
  const words = trimString(text).split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];

  const chunks = [];
  let current = '';
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (current && next.length > maxChunkLength) {
      chunks.push(current);
      current = word;
      continue;
    }
    current = next;
  }
  if (current) {
    chunks.push(current);
  }
  return chunks;
}

function buildHistoryMessage({ role, content, metadata, timestamp = Date.now() }) {
  const message = {
    role,
    content: [{ type: 'text', text: content }],
    ts: timestamp,
  };
  if (metadata && typeof metadata === 'object') {
    message.metadata = metadata;
  }
  return message;
}

function buildLocalGatewayAssistantText(userText) {
  const normalized = trimString(userText);
  if (!normalized) {
    return 'Local OpenClaw dev agent is connected and ready.';
  }
  return `Local OpenClaw dev agent received: ${normalized}`;
}

function createLocalGatewayAssistantFrames({ sessionKey, replyText, runId, seqStart = 1, timestampStart = Date.now() }) {
  const spoken = inferSpokenMetadataFromContent(replyText);
  const chunks = chunkText(replyText);
  const frames = [];
  let seq = seqStart;
  let ts = timestampStart;

  frames.push({
    type: 'event',
    event: 'agent',
    payload: {
      runId,
      stream: 'lifecycle',
      data: { phase: 'start' },
      sessionKey,
      seq: seq++,
      ts: ts++,
    },
  });

  for (const chunk of chunks) {
    frames.push({
      type: 'event',
      event: 'agent',
      payload: {
        runId,
        stream: 'assistant',
        delta: chunk,
        sessionKey,
        seq: seq++,
        ts: ts++,
      },
    });
  }

  frames.push({
    type: 'event',
    event: 'chat',
    payload: {
      runId,
      sessionKey,
      seq: seq++,
      ts: ts++,
      state: 'final',
      message: {
        role: 'assistant',
        content: [{ type: 'text', text: replyText }],
        timestamp: Date.now(),
        metadata: spoken ? { spoken } : {},
      },
    },
  });

  frames.push({
    type: 'event',
    event: 'agent',
    payload: {
      runId,
      stream: 'lifecycle',
      data: { phase: 'end' },
      sessionKey,
      seq: seq++,
      ts: ts++,
    },
  });

  return frames;
}

function createUnauthorizedResponse(id) {
  return {
    type: 'res',
    id,
    ok: false,
    error: {
      code: 'unauthorized',
      message: 'Local gateway auth rejected the connection request.',
    },
  };
}

function createOkResponse(id, payload = {}) {
  return {
    type: 'res',
    id,
    ok: true,
    payload,
  };
}

function createAbortedEvent(sessionKey) {
  return {
    type: 'event',
    event: 'chat',
    payload: {
      sessionKey,
      state: 'aborted',
      timestamp: Date.now(),
    },
  };
}

function scheduleAssistantFrames({ socket, sessionKey, frames, pendingReplies, logger }) {
  const existing = pendingReplies.get(sessionKey);
  if (existing?.timers) {
    for (const timer of existing.timers) {
      clearTimeout(timer);
    }
  }

  const timers = [];
  frames.forEach((frame, index) => {
    const timer = setTimeout(() => {
      if (socket.readyState !== WebSocket.OPEN) return;
      socket.send(JSON.stringify(frame));
      if (index === frames.length - 1) {
        pendingReplies.delete(sessionKey);
      }
    }, index * 30);
    timers.push(timer);
  });
  pendingReplies.set(sessionKey, { timers });
  logger?.(`[dev-gateway] queued assistant reply for ${sessionKey} (${frames.length} frames)`);
}

async function startLocalGatewayAgentServer({ host, port, token, password, logger = () => {} } = {}) {
  const gatewayConfig = resolveGatewayConfig();
  const bindHost = trimString(host, gatewayConfig.host);
  const bindPort = Number.isFinite(Number(port)) && Number(port) > 0 ? Math.floor(Number(port)) : gatewayConfig.port;
  const authToken = trimString(token, gatewayConfig.token);
  const authPassword = trimString(password, gatewayConfig.password);
  const histories = new Map();
  const pendingReplies = new Map();

  const server = new WebSocketServer({
    host: bindHost,
    port: bindPort,
  });

  const closePendingForSession = (sessionKey) => {
    const pending = pendingReplies.get(sessionKey);
    if (!pending?.timers) return false;
    for (const timer of pending.timers) {
      clearTimeout(timer);
    }
    pendingReplies.delete(sessionKey);
    return true;
  };

  const appendHistory = (sessionKey, message) => {
    const history = histories.get(sessionKey) || [];
    history.push(message);
    histories.set(sessionKey, history);
  };

  server.on('connection', (socket) => {
    const challengeNonce = `dev-nonce-${randomUUID()}`;
    socket.send(JSON.stringify({
      type: 'event',
      event: 'connect.challenge',
      payload: { nonce: challengeNonce },
    }));
    logger(`[dev-gateway] connection opened, challenge sent (${challengeNonce})`);

    socket.on('message', (rawMessage) => {
      let frame;
      try {
        frame = JSON.parse(String(rawMessage));
      } catch {
        return;
      }

      if (!frame || frame.type !== 'req') {
        return;
      }

      const requestId = trimString(frame.id);
      const method = trimString(frame.method);
      const params = frame.params && typeof frame.params === 'object' ? frame.params : {};
      const sessionKey = trimString(params.sessionKey, 'agent:main:webchat:channel:oomi');

      if (method === 'connect') {
        const requestAuth = params.auth && typeof params.auth === 'object' ? params.auth : {};
        const providedToken = trimString(requestAuth.token);
        const providedPassword = trimString(requestAuth.password);
        const authorized =
          (!authToken || providedToken === authToken) &&
          (!authPassword || providedPassword === authPassword);
        socket.send(JSON.stringify(authorized ? createOkResponse(requestId, { sessionKey }) : createUnauthorizedResponse(requestId)));
        return;
      }

      if (method === 'chat.history') {
        const messages = histories.get(sessionKey) || [];
        socket.send(JSON.stringify(createOkResponse(requestId, { messages })));
        return;
      }

      if (method === 'chat.abort') {
        closePendingForSession(sessionKey);
        socket.send(JSON.stringify(createOkResponse(requestId)));
        socket.send(JSON.stringify(createAbortedEvent(sessionKey)));
        return;
      }

      if (method !== 'chat.send') {
        socket.send(JSON.stringify({
          type: 'res',
          id: requestId,
          ok: false,
          error: {
            code: 'unsupported_method',
            message: `Local dev gateway does not handle ${method || 'unknown'}.`,
          },
        }));
        return;
      }

      const messageText = trimString(params.message);
      appendHistory(sessionKey, buildHistoryMessage({
        role: 'user',
        content: messageText,
      }));
      socket.send(JSON.stringify(createOkResponse(requestId)));

      if (!messageText || messageText.includes(PRIMER_MARKER)) {
        return;
      }

      const replyText = buildLocalGatewayAssistantText(messageText);
      const runId = `dev-run-${randomUUID()}`;
      const assistantMessage = buildHistoryMessage({
        role: 'assistant',
        content: replyText,
        metadata: {
          spoken: inferSpokenMetadataFromContent(replyText),
        },
      });
      appendHistory(sessionKey, assistantMessage);
      const frames = createLocalGatewayAssistantFrames({
        sessionKey,
        replyText,
        runId,
      });
      scheduleAssistantFrames({
        socket,
        sessionKey,
        frames,
        pendingReplies,
        logger,
      });
    });

    socket.on('close', () => {
      for (const [sessionKey, pending] of pendingReplies.entries()) {
        if (!pending?.timers) continue;
        for (const timer of pending.timers) {
          clearTimeout(timer);
        }
        pendingReplies.delete(sessionKey);
      }
      logger('[dev-gateway] connection closed');
    });
  });

  await new Promise((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });

  logger(`[dev-gateway] listening on ws://${bindHost}:${bindPort}`);

  return {
    host: bindHost,
    port: bindPort,
    token: authToken,
    password: authPassword,
    close: async () => {
      for (const pending of pendingReplies.values()) {
        if (!pending?.timers) continue;
        for (const timer of pending.timers) {
          clearTimeout(timer);
        }
      }
      pendingReplies.clear();
      await new Promise((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      });
    },
  };
}

export {
  buildLocalGatewayAssistantText,
  createLocalGatewayAssistantFrames,
  startLocalGatewayAgentServer,
};
