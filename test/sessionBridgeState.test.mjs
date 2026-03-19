import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ensureSessionBridge,
  flushWaitingForConnect,
  forwardFrameToSession,
} from '../bin/sessionBridgeState.js';

function makeSocket(readyState = 0) {
  return {
    readyState,
    sent: [],
    send(payload) {
      this.sent.push(payload);
    },
  };
}

test('ensureSessionBridge creates a new session when first frame arrives before client.open', () => {
  const sessions = new Map();
  const created = [];

  const session = ensureSessionBridge({
    sessions,
    sessionId: 's-1',
    createSocket: (sessionId) => {
      created.push(sessionId);
      return makeSocket(0);
    },
  });

  assert.equal(created.length, 1);
  assert.equal(created[0], 's-1');
  assert.ok(session);
  assert.equal(sessions.size, 1);
});

test('forwardFrameToSession queues frame while gateway socket is connecting', () => {
  const session = { socket: makeSocket(0), queue: [] };
  const result = forwardFrameToSession(session, '{"type":"req"}');

  assert.equal(result, 'queued');
  assert.deepEqual(session.queue, ['{"type":"req"}']);
});

test('forwardFrameToSession sends immediately when gateway socket is open', () => {
  const session = { socket: makeSocket(1), queue: [] };
  const result = forwardFrameToSession(session, '{"type":"req"}');

  assert.equal(result, 'sent');
  assert.deepEqual(session.socket.sent, ['{"type":"req"}']);
});

test('forwardFrameToSession defers post-connect frames until connect is accepted', () => {
  const session = {
    socket: makeSocket(1),
    queue: [],
    connectAccepted: false,
    waitingForConnect: [],
  };

  const result = forwardFrameToSession(session, '{"type":"req","method":"chat.send"}', {
    requiresConnectAccepted: true,
  });

  assert.equal(result, 'waiting_for_connect');
  assert.deepEqual(session.waitingForConnect, ['{"type":"req","method":"chat.send"}']);
  assert.deepEqual(session.socket.sent, []);
});

test('flushWaitingForConnect releases deferred frames after connect is accepted', () => {
  const session = {
    socket: makeSocket(1),
    queue: [],
    connectAccepted: false,
    waitingForConnect: ['{"type":"req","method":"chat.send"}'],
  };

  const flushed = flushWaitingForConnect(session);

  assert.equal(session.connectAccepted, true);
  assert.deepEqual(flushed, [
    {
      frameText: '{"type":"req","method":"chat.send"}',
      result: 'sent',
    },
  ]);
  assert.deepEqual(session.waitingForConnect, []);
  assert.deepEqual(session.socket.sent, ['{"type":"req","method":"chat.send"}']);
});
