import test from 'node:test';
import assert from 'node:assert/strict';

import { createChannelPluginClient } from '../lib/channelPluginClient.js';

function createFetchRecorder({ payload = { ok: true }, ok = true, status = 200 } = {}) {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    return {
      ok,
      status,
      json: async () => payload,
    };
  };

  return { calls, fetchImpl };
}

test('channel plugin client polls filtered persona job messages', async () => {
  const { calls, fetchImpl } = createFetchRecorder({
    payload: { ok: true, messages: [] },
  });
  const client = createChannelPluginClient({
    backendUrl: 'https://api.oomi.ai/',
    deviceToken: 'device-token',
    fetchImpl,
  });

  const result = await client.pollMessages({
    limit: 5,
    metadataType: 'persona_job',
  });

  assert.equal(result.ok, true);
  assert.equal(calls[0].url, 'https://api.oomi.ai/v1/channel/plugin/poll');
  assert.equal(calls[0].options.headers.Authorization, 'Bearer device-token');
  assert.match(calls[0].options.body, /"metadataType":"persona_job"/);
});

test('channel plugin client acks failed messages with failure code', async () => {
  const { calls, fetchImpl } = createFetchRecorder({
    payload: { ok: true, message: { messageId: 'msg_123' } },
  });
  const client = createChannelPluginClient({
    backendUrl: 'https://api.oomi.ai',
    deviceToken: 'device-token',
    fetchImpl,
  });

  const result = await client.ackMessage({
    messageId: 'msg_123',
    outcome: 'failed',
    failureCode: 'persona_job_execution_failed',
  });

  assert.equal(result.ok, true);
  assert.equal(calls[0].url, 'https://api.oomi.ai/v1/channel/plugin/acks');
  assert.match(calls[0].options.body, /"failureCode":"persona_job_execution_failed"/);
});
