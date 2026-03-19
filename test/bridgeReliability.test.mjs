import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

import {
  buildBridgeLaunchAgentPlist,
  prepareGatewayFrameForLocalGateway,
  ensureAssistantSpokenMetadata,
  normalizeAssistantGatewayFrame,
  runAssistantFinalDebugCheck,
  classifyBridgeFailure,
  classifyBridgeSessionScope,
  createBridgeProcessFaultHandler,
  computeReconnectDelayMs,
  extractGatewayRequestMeta,
  extractGatewayResponseMeta,
  isServiceManagedBridgeStart,
  isGatewayRunStartedFrame,
  isBridgeWorkerCommand,
  resolveBridgeStatusForRuntimeFault,
  resolveBridgeStatusForBrokerOpen,
  runBridgeCallbackSafely,
} from '../bin/oomi-ai.js';
import {
  buildLocalGatewayAssistantText,
  createLocalGatewayAssistantFrames,
} from '../lib/openclawDevGateway.js';

function buildDeviceIdentity() {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  return {
    deviceId: 'device-test-1',
    publicKeyPem: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
    privateKeyPem: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
  };
}

test('prepareGatewayFrameForLocalGateway waits for challenge nonce when device signing is enabled', () => {
  const connectFrame = JSON.stringify({
    type: 'req',
    id: 'r1',
    method: 'connect',
    params: {
      client: {
        id: 'webchat-ui',
        mode: 'webchat',
        platform: 'web',
      },
      scopes: ['operator.read'],
    },
  });

  const result = prepareGatewayFrameForLocalGateway(
    connectFrame,
    { token: 'gateway-token', password: '' },
    {
      connectNonce: '',
      deviceIdentity: buildDeviceIdentity(),
    }
  );

  assert.equal(result.waitForChallenge, true);
});

test('prepareGatewayFrameForLocalGateway signs connect when nonce is available', () => {
  const connectFrame = JSON.stringify({
    type: 'req',
    id: 'r1',
    method: 'connect',
    params: {
      client: {
        id: 'webchat-ui',
        mode: 'webchat',
        platform: 'web',
        debugOnly: 'drop-me',
      },
      sessionKey: 'agent:main:webchat:channel:oomi',
      scopes: ['operator.read'],
    },
  });

  const result = prepareGatewayFrameForLocalGateway(
    connectFrame,
    { token: 'gateway-token', password: '' },
    {
      connectNonce: 'nonce-123',
      deviceIdentity: buildDeviceIdentity(),
    }
  );

  assert.equal(result.waitForChallenge, false);
  assert.ok(typeof result.frameText === 'string' && result.frameText.length > 0);

  const parsed = JSON.parse(result.frameText);
  assert.equal(parsed.params.client.id, 'node-host');
  assert.equal(parsed.params.client.mode, 'backend');
  assert.equal(parsed.params.client.debugOnly, undefined);
  assert.equal(parsed.params.sessionKey, undefined);
  assert.equal(parsed.params.device.nonce, 'nonce-123');
  assert.equal(parsed.params.auth.token, 'gateway-token');
});

test('prepareGatewayFrameForLocalGateway shapes chat.send params with a strict allowlist', () => {
  const chatSendFrame = JSON.stringify({
    type: 'req',
    id: 'r_chat_send',
    method: 'chat.send',
    params: {
      sessionKey: 'agent:main:webchat:channel:oomi',
      message: 'hello world',
      thinking: true,
      deliver: 'default',
      timeoutMs: 15000,
      idempotencyKey: 'idem-chat-send-1',
      attachments: [{ type: 'image', url: 'https://example.test/a.png' }],
      correlationId: 'corr-123',
      metadata: {
        correlationId: 'corr-123',
        source: 'web',
      },
      unexpected: 'drop-me',
    },
  });

  const sendResult = prepareGatewayFrameForLocalGateway(chatSendFrame, { token: 'gateway-token', password: '' }, {});
  assert.equal(sendResult.waitForChallenge, false);
  const sendParsed = JSON.parse(sendResult.frameText);
  assert.deepEqual(sendParsed.params, {
    sessionKey: 'agent:main:webchat:channel:oomi',
    message: 'hello world',
    thinking: true,
    deliver: 'default',
    timeoutMs: 15000,
    idempotencyKey: 'idem-chat-send-1',
    attachments: [{ type: 'image', url: 'https://example.test/a.png' }],
  });
});

test('prepareGatewayFrameForLocalGateway synthesizes idempotencyKey for chat.send when missing', () => {
  const chatSendFrame = JSON.stringify({
    type: 'req',
    id: 'r_chat_send_missing_idem',
    method: 'chat.send',
    params: {
      sessionKey: 'agent:main:webchat:channel:oomi',
      message: 'hello world',
      correlationId: 'corr-456',
      metadata: {
        correlationId: 'corr-456',
        source: 'web',
      },
    },
  });

  const sendResult = prepareGatewayFrameForLocalGateway(chatSendFrame, { token: 'gateway-token', password: '' }, {});
  assert.equal(sendResult.waitForChallenge, false);

  const sendParsed = JSON.parse(sendResult.frameText);
  assert.equal(sendParsed.params.sessionKey, 'agent:main:webchat:channel:oomi');
  assert.equal(sendParsed.params.message, 'hello world');
  assert.equal(sendParsed.params.idempotencyKey, 'corr-456');
  assert.equal(sendParsed.params.correlationId, undefined);
  assert.equal(sendParsed.params.metadata, undefined);
});

test('prepareGatewayFrameForLocalGateway shapes chat.history params with a strict allowlist', () => {
  const historyFrame = JSON.stringify({
    type: 'req',
    id: 'r_chat_history',
    method: 'chat.history',
    params: {
      sessionKey: 'agent:main:webchat:channel:oomi',
      limit: 50,
      correlationId: 'corr-456',
      metadata: { source: 'history-bootstrap' },
      unexpected: 'drop-me',
    },
  });

  const historyResult = prepareGatewayFrameForLocalGateway(historyFrame, { token: 'gateway-token', password: '' }, {});
  assert.equal(historyResult.waitForChallenge, false);
  const historyParsed = JSON.parse(historyResult.frameText);
  assert.deepEqual(historyParsed.params, {
    sessionKey: 'agent:main:webchat:channel:oomi',
    limit: 50,
  });
});

test('buildBridgeLaunchAgentPlist starts bridge in service-managed mode', () => {
  const plist = buildBridgeLaunchAgentPlist();
  assert.match(plist, /<string>openclaw<\/string>/);
  assert.match(plist, /<string>bridge<\/string>/);
  assert.match(plist, /<string>start<\/string>/);
  assert.match(plist, /<string>--service-managed<\/string>/);
});

test('ensureAssistantSpokenMetadata synthesizes hidden spoken metadata for assistant chat finals', () => {
  const frame = JSON.stringify({
    type: 'event',
    event: 'chat',
    payload: {
      sessionKey: 'agent:main:webchat:channel:oomi',
      state: 'final',
      message: {
        role: 'assistant',
        content: "Hell yeah. This one sounds more natural.",
      },
    },
  });

  const result = ensureAssistantSpokenMetadata(frame);
  assert.equal(result.changed, true);
  assert.equal(result.reason, 'synthesized');

  const parsed = JSON.parse(result.frameText);
  assert.equal(parsed.payload.message.metadata.spoken.text, 'Hell yeah. This one sounds more natural.');
  assert.equal(parsed.payload.message.metadata.spoken.language, 'English');
  assert.equal(parsed.payload.message.metadata.spoken.instructions, 'Speak with warm, upbeat conversational energy and natural pacing.');
  assert.ok(Array.isArray(parsed.payload.message.metadata.spoken.segments));
  assert.ok(parsed.payload.message.metadata.spoken.segments.length >= 1);
});

test('ensureAssistantSpokenMetadata synthesizes hidden spoken metadata for assistant chat finals without role', () => {
  const frame = JSON.stringify({
    type: 'event',
    event: 'chat',
    payload: {
      sessionKey: 'agent:main:webchat:channel:oomi',
      state: 'final',
      message: {
        content: "Hey, I think we're actually close.",
      },
    },
  });

  const result = ensureAssistantSpokenMetadata(frame);
  assert.equal(result.changed, true);
  assert.equal(result.reason, 'synthesized_missing_role');

  const parsed = JSON.parse(result.frameText);
  assert.equal(parsed.payload.message.metadata.spoken.text, "Hey, I think we're actually close.");
  assert.ok(Array.isArray(parsed.payload.message.metadata.spoken.segments));
  assert.ok(parsed.payload.message.metadata.spoken.segments.length >= 1);
});

test('ensureAssistantSpokenMetadata strips avatar command tags from spoken metadata while keeping the frame visible content intact', () => {
  const frame = JSON.stringify({
    type: 'event',
    event: 'chat',
    payload: {
      sessionKey: 'agent:main:webchat:channel:oomi',
      state: 'final',
      message: {
        role: 'assistant',
        content: '[anim:wave] [face:happy] Hey Justin! How is the testing going?',
      },
    },
  });

  const result = ensureAssistantSpokenMetadata(frame);
  assert.equal(result.changed, true);

  const parsed = JSON.parse(result.frameText);
  assert.equal(parsed.payload.message.content, '[anim:wave] [face:happy] Hey Justin! How is the testing going?');
  assert.equal(parsed.payload.message.metadata.spoken.text, 'Hey Justin! How is the testing going?');
  assert.deepEqual(
    parsed.payload.message.metadata.spoken.segments.map((segment) => segment.text),
    ['Hey Justin!', 'How is the testing going?']
  );
});

test('runAssistantFinalDebugCheck keeps synthesized spoken segments text-equivalent for comma-heavy assistant finals', () => {
  const result = runAssistantFinalDebugCheck({
    text: 'When your voice reaches me, it gets turned into text, I read it and think about it, then I speak back through the managed chat session.',
  });

  assert.equal(result.changed, true);
  assert.equal(result.reason, 'synthesized');
  assert.ok(result.spoken);
  assert.ok(Array.isArray(result.spoken.segments));
  assert.ok(result.spoken.segments.length >= 2);

  const reconstructed = result.spoken.segments
    .map((segment) => segment.text)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();

  assert.equal(reconstructed, result.spoken.text);
  assert.equal(reconstructed.includes(',,'), false);
});

test('runAssistantFinalDebugCheck preserves ellipses as speech pauses without punctuation-only segments', () => {
  const result = runAssistantFinalDebugCheck({
    text: "Alright, round... what number test is this now? But right now it's just... checking in.",
  });

  assert.equal(result.changed, true);
  assert.ok(result.spoken);
  assert.equal(
    result.spoken.text,
    "Alright, round... what number test is this now? But right now it's just... checking in."
  );
  assert.equal(result.spoken.segments[0]?.text, 'Alright, round...');
  assert.equal(result.spoken.segments.some((segment) => segment.text.includes("just...")), true);

  const reconstructed = result.spoken.segments
    .map((segment) => segment.text)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();

  assert.equal(reconstructed, result.spoken.text);
  assert.equal(result.spoken.segments.some((segment) => /^[.?!]+$/.test(segment.text)), false);
});

test('ensureAssistantSpokenMetadata preserves explicit spoken metadata on assistant chat finals', () => {
  const frame = JSON.stringify({
    type: 'event',
    event: 'chat',
    payload: {
      sessionKey: 'agent:main:webchat:channel:oomi',
      state: 'final',
      message: {
        role: 'assistant',
        content: 'Visible text.',
        metadata: {
          spoken: {
            text: 'Speech-only text.',
            instructions: 'Speak softly.',
            style: { emotion: 'gentle' },
          },
        },
      },
    },
  });

  const result = ensureAssistantSpokenMetadata(frame);
  assert.equal(result.changed, true);
  assert.equal(result.reason, 'normalized');

  const parsed = JSON.parse(result.frameText);
  assert.deepEqual(parsed.payload.message.metadata.spoken, {
    text: 'Speech-only text.',
    language: 'English',
    segments: [
      {
        text: 'Speech-only text.',
        pace: 'medium',
        pitch: 'slightly_high',
        energy: 'warm',
        volume: 'normal',
        pause_after_ms: 0,
      },
    ],
    instructions: 'Speak softly.',
    style: { emotion: 'gentle' },
  });
});

test('isServiceManagedBridgeStart only enables launchd-authoritative bridge starts when flagged', () => {
  assert.equal(isServiceManagedBridgeStart({}), false);
  assert.equal(isServiceManagedBridgeStart({ 'service-managed': false }), false);
  assert.equal(isServiceManagedBridgeStart({ 'service-managed': true }), true);
  assert.equal(isServiceManagedBridgeStart({ 'service-managed': '1' }), true);
});

test('ensureAssistantSpokenMetadata repairs invalid explicit spoken metadata on assistant chat finals', () => {
  const frame = JSON.stringify({
    type: 'event',
    event: 'chat',
    payload: {
      sessionKey: 'agent:main:webchat:channel:oomi',
      state: 'final',
      message: {
        role: 'assistant',
        content: "Hey, I think we're actually close.",
        metadata: {
          spoken: null,
        },
      },
    },
  });

  const result = ensureAssistantSpokenMetadata(frame);
  assert.equal(result.changed, true);
  assert.equal(result.reason, 'synthesized');

  const parsed = JSON.parse(result.frameText);
  assert.equal(parsed.payload.message.metadata.spoken.text, "Hey, I think we're actually close.");
  assert.ok(Array.isArray(parsed.payload.message.metadata.spoken.segments));
  assert.ok(parsed.payload.message.metadata.spoken.segments.length >= 1);
});

test('ensureAssistantSpokenMetadata ignores non-final or explicit non-assistant frames', () => {
  const frame = JSON.stringify({
    type: 'event',
    event: 'chat',
    payload: {
      state: 'delta',
      message: {
        role: 'assistant',
        content: 'Partial text',
      },
    },
  });

  const result = ensureAssistantSpokenMetadata(frame);
  assert.equal(result.changed, false);
  assert.equal(result.frameText, frame);

  const userFrame = JSON.stringify({
    type: 'event',
    event: 'chat',
    payload: {
      state: 'final',
      message: {
        role: 'user',
        content: 'User text',
      },
    },
  });

  const userResult = ensureAssistantSpokenMetadata(userFrame);
  assert.equal(userResult.changed, false);
  assert.equal(userResult.frameText, userFrame);
});

test('normalizeAssistantGatewayFrame injects spoken metadata for managed chat sessions, not just voice sessions', () => {
  const frame = JSON.stringify({
    type: 'event',
    event: 'chat',
    payload: {
      sessionKey: 'agent:main:webchat:channel:oomi',
      state: 'final',
      message: {
        role: 'assistant',
        content: "Hey Justin, the voice path is using the normal managed chat session.",
      },
    },
  });

  const result = normalizeAssistantGatewayFrame('ms_123abc', frame);
  assert.equal(result.scope, 'default');
  assert.equal(result.changed, true);
  assert.equal(result.reason, 'synthesized');

  const parsed = JSON.parse(result.frameText);
  assert.equal(
    parsed.payload.message.metadata.spoken.text,
    'Hey Justin, the voice path is using the normal managed chat session.'
  );
  assert.ok(Array.isArray(parsed.payload.message.metadata.spoken.segments));
  assert.ok(parsed.payload.message.metadata.spoken.segments.length >= 1);
});

test('runAssistantFinalDebugCheck replays managed assistant finals through the same spoken metadata path', () => {
  const result = runAssistantFinalDebugCheck({
    sessionId: 'ms_debug_test',
    text: 'When your voice reaches me, I read it and think about it, then I speak back through the managed chat session.',
  });

  assert.equal(result.scope, 'default');
  assert.equal(result.changed, true);
  assert.equal(result.reason, 'synthesized');
  assert.equal(result.before.spokenNormalized, false);
  assert.equal(result.after.spokenNormalized, true);
  assert.equal(
    result.spoken.text,
    'When your voice reaches me, I read it and think about it, then I speak back through the managed chat session.'
  );
  assert.ok(Array.isArray(result.spoken.segments));
  assert.ok(result.spoken.segments.length >= 2);
});

test('classifyBridgeFailure maps network and auth failures correctly', () => {
  const network = classifyBridgeFailure({
    err: Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' }),
  });
  assert.equal(network.failureClass, 'network');
  assert.equal(network.retryable, true);

  const auth = classifyBridgeFailure({
    reason: 'broker rejected connection: unauthorized token',
  });
  assert.equal(auth.failureClass, 'auth_rejected');
  assert.equal(auth.retryable, false);
});

test('computeReconnectDelayMs grows with attempts', () => {
  const originalRandom = Math.random;
  Math.random = () => 0;
  try {
    assert.equal(computeReconnectDelayMs(1, 2000), 2000);
    assert.equal(computeReconnectDelayMs(2, 2000), 4000);
    assert.equal(computeReconnectDelayMs(3, 2000), 8000);
  } finally {
    Math.random = originalRandom;
  }
});

test('resolveBridgeStatusForBrokerOpen keeps managed bridge in starting until DeviceChannel subscription', () => {
  assert.equal(
    resolveBridgeStatusForBrokerOpen({ actionCableMode: true, deviceSubscribed: false }),
    'starting'
  );
  assert.equal(
    resolveBridgeStatusForBrokerOpen({ actionCableMode: true, deviceSubscribed: true }),
    'connected'
  );
  assert.equal(
    resolveBridgeStatusForBrokerOpen({ actionCableMode: false, deviceSubscribed: false }),
    'connected'
  );
});

test('classifyBridgeSessionScope treats voice sessions as local-only faults', () => {
  assert.equal(classifyBridgeSessionScope('voice_session_abc123'), 'voice');
  assert.equal(classifyBridgeSessionScope('ms_abc123'), 'default');
  assert.equal(classifyBridgeSessionScope(''), 'default');
});

test('resolveBridgeStatusForRuntimeFault keeps voice-session faults from downgrading provider status', () => {
  assert.equal(
    resolveBridgeStatusForRuntimeFault({ currentStatus: 'connected', sessionId: 'voice_session_abc123' }),
    'connected'
  );
  assert.equal(
    resolveBridgeStatusForRuntimeFault({ currentStatus: 'connected', sessionId: 'ms_abc123' }),
    'degraded'
  );
  assert.equal(
    resolveBridgeStatusForRuntimeFault({ currentStatus: 'starting', sessionId: 'ms_abc123' }),
    'error'
  );
});

test('runBridgeCallbackSafely reports errors instead of throwing from callback bodies', () => {
  let captured = null;
  const wrapped = runBridgeCallbackSafely(
    () => {
      throw new Error('boom');
    },
    (err) => {
      captured = err;
    }
  );

  assert.doesNotThrow(() => wrapped('payload'));
  assert.equal(captured instanceof Error, true);
  assert.equal(captured?.message, 'boom');
});

test('createBridgeProcessFaultHandler degrades connected bridges without exiting', () => {
  const reports = [];
  const exits = [];
  const handler = createBridgeProcessFaultHandler({
    readStatus: () => ({ status: 'connected' }),
    onReport: (payload) => reports.push(payload),
    onExit: (code) => exits.push(code),
  });

  handler({ phase: 'process.unhandledRejection', error: new Error('network blew up') });

  assert.equal(reports.length, 1);
  assert.equal(reports[0].status, 'degraded');
  assert.equal(reports[0].phase, 'process.unhandledRejection');
  assert.equal(reports[0].error.message, 'network blew up');
  assert.deepEqual(exits, []);
});

test('createBridgeProcessFaultHandler exits when startup faults happen before connection', () => {
  const reports = [];
  const exits = [];
  const handler = createBridgeProcessFaultHandler({
    readStatus: () => ({ status: 'starting' }),
    onReport: (payload) => reports.push(payload),
    onExit: (code) => exits.push(code),
  });

  handler({ phase: 'process.uncaughtException', error: new Error('startup fault') });

  assert.equal(reports.length, 1);
  assert.equal(reports[0].status, 'error');
  assert.deepEqual(exits, [1]);
});

test('request/response metadata extraction supports correlation trace', () => {
  const requestMeta = extractGatewayRequestMeta(
    JSON.stringify({
      type: 'req',
      id: 'r100',
      method: 'chat.send',
      params: {
        correlationId: 'corr-100',
      },
    })
  );
  assert.deepEqual(requestMeta, {
    requestId: 'r100',
    method: 'chat.send',
    correlationId: 'corr-100',
  });

  const responseMeta = extractGatewayResponseMeta(
    JSON.stringify({
      type: 'res',
      id: 'r100',
      ok: true,
    })
  );
  assert.deepEqual(responseMeta, {
    requestId: 'r100',
    ok: true,
  });
});

test('run start lifecycle event and bridge command detection are identified', () => {
  assert.equal(
    isGatewayRunStartedFrame(
      JSON.stringify({
        type: 'event',
        event: 'agent',
        payload: { stream: 'lifecycle', data: { phase: 'start' } },
      })
    ),
    true
  );

  assert.equal(isBridgeWorkerCommand('node oomi-ai.js openclaw bridge start --detach'), true);
  assert.equal(isBridgeWorkerCommand('node oomi-ai.js openclaw bridge ps'), false);
});

test('local gateway assistant reply is deterministic and human-readable', () => {
  assert.equal(
    buildLocalGatewayAssistantText('Please confirm the local dev bridge is working'),
    'Local OpenClaw dev agent received: Please confirm the local dev bridge is working'
  );
});

test('local gateway assistant frames include lifecycle, streaming deltas, and final spoken metadata', () => {
  const frames = createLocalGatewayAssistantFrames({
    sessionKey: 'agent:main:webchat:channel:oomi',
    replyText: 'Local OpenClaw dev agent received: Hello from smoke test',
    runId: 'dev-run-1',
  });

  assert.equal(frames[0].event, 'agent');
  assert.equal(frames[0].payload.stream, 'lifecycle');
  assert.equal(frames[0].payload.data.phase, 'start');

  const finalFrame = frames.find((frame) => frame.event === 'chat');
  assert.ok(finalFrame);
  assert.equal(finalFrame.payload.state, 'final');
  assert.equal(finalFrame.payload.message.role, 'assistant');
  assert.equal(finalFrame.payload.message.metadata.spoken.text, 'Local OpenClaw dev agent received: Hello from smoke test');
  assert.ok(Array.isArray(finalFrame.payload.message.metadata.spoken.segments));
  assert.ok(finalFrame.payload.message.metadata.spoken.segments.length >= 1);

  const endFrame = frames[frames.length - 1];
  assert.equal(endFrame.event, 'agent');
  assert.equal(endFrame.payload.stream, 'lifecycle');
  assert.equal(endFrame.payload.data.phase, 'end');
});

test('cli help lists persona-runtime debug smoke command', () => {
  const cliPath = path.join(process.cwd(), 'bin', 'oomi-ai.js');
  const result = spawnSync(process.execPath, [cliPath, '--help'], {
    cwd: process.cwd(),
    encoding: 'utf8',
    env: {
      ...process.env,
      OOMI_SKIP_UPDATE_CHECK: '1',
    },
  });

  assert.equal(result.status, 0);
  assert.match(result.stdout, /openclaw debug persona-runtime/);
  assert.match(result.stdout, /openclaw debug local-gateway-agent/);
});
