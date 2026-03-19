const WS_CONNECTING = 0;
const WS_OPEN = 1;

/**
 * Ensure session state exists so client frames can be buffered before client.open arrives.
 */
export function ensureSessionBridge({ sessions, sessionId, createSocket }) {
  const id = String(sessionId || '').trim();
  if (!id) return null;

  const existing = sessions.get(id);
  if (existing) return existing;

  const socket = createSocket(id);
  const next = {
    socket,
    queue: [],
    connectAccepted: false,
    waitingForConnect: [],
  };
  sessions.set(id, next);
  return next;
}

/**
 * Forward a frame to the gateway socket or queue it while connecting.
 */
export function forwardFrameToSession(sessionBridge, frameText, options = {}) {
  if (!sessionBridge || !sessionBridge.socket || typeof frameText !== 'string' || !frameText) {
    return 'dropped';
  }

  if (options.requiresConnectAccepted === true && sessionBridge.connectAccepted !== true) {
    if (!Array.isArray(sessionBridge.waitingForConnect)) {
      sessionBridge.waitingForConnect = [];
    }
    sessionBridge.waitingForConnect.push(frameText);
    return 'waiting_for_connect';
  }

  const { socket } = sessionBridge;
  if (socket.readyState === WS_OPEN) {
    socket.send(frameText);
    return 'sent';
  }

  if (socket.readyState === WS_CONNECTING) {
    sessionBridge.queue.push(frameText);
    return 'queued';
  }

  return 'dropped';
}

export function flushWaitingForConnect(sessionBridge) {
  if (!sessionBridge) return [];

  sessionBridge.connectAccepted = true;
  const pending = Array.isArray(sessionBridge.waitingForConnect)
    ? sessionBridge.waitingForConnect.splice(0, sessionBridge.waitingForConnect.length)
    : [];

  return pending.map((frameText) => ({
    frameText,
    result: forwardFrameToSession(sessionBridge, frameText),
  }));
}

export function flushSessionQueue(sessionBridge) {
  if (!sessionBridge || !sessionBridge.socket) return;
  const socket = sessionBridge.socket;
  while (sessionBridge.queue.length > 0 && socket.readyState === WS_OPEN) {
    const nextFrame = sessionBridge.queue.shift();
    if (typeof nextFrame === 'string' && nextFrame) {
      socket.send(nextFrame);
    }
  }
}
