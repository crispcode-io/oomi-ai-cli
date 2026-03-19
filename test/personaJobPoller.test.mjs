import test from 'node:test';
import assert from 'node:assert/strict';

import { startPersonaJobPoller } from '../lib/personaJobPoller.js';

test('persona job poller executes and acks delivered jobs', async () => {
  const calls = [];
  let poller = null;
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    if (url.endsWith('/v1/channel/plugin/poll')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          ok: true,
          messages: [
            {
              messageId: 'msg_123',
              metadata: {
                type: 'persona_job',
                payload: { jobId: 'pj_123' },
              },
            },
          ],
        }),
      };
    }

    return {
      ok: true,
      status: 200,
      json: async () => ({ ok: true }),
    };
  };

  let handledJobId = '';
  poller = startPersonaJobPoller({
    backendUrl: 'https://api.oomi.ai',
    deviceToken: 'device-token',
    fetchImpl,
    pollIntervalMs: 1,
    idleIntervalMs: 1,
    onMessage: async (message) => {
      handledJobId = message.metadata.payload.jobId;
      poller.stop();
    },
  });

  await poller.completed;

  assert.equal(handledJobId, 'pj_123');
  assert.equal(calls[0].url, 'https://api.oomi.ai/v1/channel/plugin/poll');
  assert.equal(calls[1].url, 'https://api.oomi.ai/v1/channel/plugin/acks');
  assert.match(calls[1].options.body, /"outcome":"delivered"/);
});

test('persona job poller acks failed callback executions', async () => {
  const calls = [];
  let pollCount = 0;
  let poller = null;
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    if (url.endsWith('/v1/channel/plugin/poll')) {
      pollCount += 1;
      return {
        ok: true,
        status: 200,
        json: async () => ({
          ok: true,
          messages:
            pollCount === 1
              ? [
                  {
                    messageId: 'msg_fail',
                    metadata: {
                      type: 'persona_job',
                      payload: { jobId: 'pj_fail' },
                    },
                  },
                ]
              : [],
        }),
      };
    }

    return {
      ok: true,
      status: 200,
      json: async () => ({ ok: true }),
    };
  };

  poller = startPersonaJobPoller({
    backendUrl: 'https://api.oomi.ai',
    deviceToken: 'device-token',
    fetchImpl,
    pollIntervalMs: 1,
    idleIntervalMs: 1,
    logger: { error() {} },
    onMessage: async () => {
      poller.stop();
      const error = new Error('boom');
      error.code = 'persona_job_execution_failed';
      throw error;
    },
  });

  await poller.completed;

  assert.equal(calls[1].url, 'https://api.oomi.ai/v1/channel/plugin/acks');
  assert.match(calls[1].options.body, /"outcome":"failed"/);
  assert.match(calls[1].options.body, /"failureCode":"persona_job_execution_failed"/);
});
