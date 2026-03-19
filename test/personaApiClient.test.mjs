import test from 'node:test';
import assert from 'node:assert/strict';

import { createPersonaApiClient } from '../lib/personaApiClient.js';

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

test('persona api client registers runtime with device auth', async () => {
  const { calls, fetchImpl } = createFetchRecorder({
    payload: { ok: true, persona: { slug: 'chef' } },
  });
  const client = createPersonaApiClient({
    backendUrl: 'https://api.oomi.ai/',
    deviceToken: 'device-token',
    deviceId: 'device_123',
    fetchImpl,
  });

  const result = await client.registerRuntime({
    slug: 'chef',
    endpoint: 'http://127.0.0.1:4789',
    healthcheckUrl: 'http://127.0.0.1:4789/oomi.health.json',
    localPort: 4789,
  });

  assert.equal(result.ok, true);
  assert.equal(calls[0].url, 'https://api.oomi.ai/v1/personas/chef/runtime_register');
  assert.equal(calls[0].options.headers.Authorization, 'Bearer device-token');
  assert.match(calls[0].options.body, /"deviceId":"device_123"/);
  assert.match(calls[0].options.body, /"localPort":4789/);
});

test('persona api client lists personas with device auth', async () => {
  const { calls, fetchImpl } = createFetchRecorder({
    payload: { personas: [{ slug: 'chef' }] },
  });
  const client = createPersonaApiClient({
    backendUrl: 'https://api.oomi.ai/',
    deviceToken: 'device-token',
    deviceId: 'device_123',
    fetchImpl,
  });

  const result = await client.listPersonas();

  assert.equal(result.personas[0].slug, 'chef');
  assert.equal(calls[0].url, 'https://api.oomi.ai/v1/personas');
  assert.equal(calls[0].options.headers.Authorization, 'Bearer device-token');
});

test('persona api client creates managed personas with device auth', async () => {
  const { calls, fetchImpl } = createFetchRecorder({
    payload: { ok: true, persona: { slug: 'cooking-persona' }, personaJob: { jobId: 'pj_123' } },
  });
  const client = createPersonaApiClient({
    backendUrl: 'https://api.oomi.ai/',
    deviceToken: 'device-token',
    deviceId: 'device_123',
    fetchImpl,
  });

  const result = await client.createManagedPersona({
    name: 'Cooking Persona',
    description: 'Private cooking workspace',
  });

  assert.equal(result.ok, true);
  assert.equal(calls[0].url, 'https://api.oomi.ai/v1/personas/managed_create');
  assert.equal(calls[0].options.headers.Authorization, 'Bearer device-token');
  assert.match(calls[0].options.body, /"name":"Cooking Persona"/);
  assert.match(calls[0].options.body, /"deviceId":"device_123"/);
});

test('persona api client posts job success payloads', async () => {
  const { calls, fetchImpl } = createFetchRecorder({
    payload: { ok: true, personaJob: { jobId: 'pj_123' } },
  });
  const client = createPersonaApiClient({
    backendUrl: 'https://api.oomi.ai',
    deviceToken: 'device-token',
    deviceId: 'device_123',
    fetchImpl,
  });

  const result = await client.succeedJob({
    jobId: 'pj_123',
    workspacePath: '/tmp/chef',
    localPort: 4789,
    transport: 'local',
    endpoint: 'http://127.0.0.1:4789',
    healthcheckUrl: 'http://127.0.0.1:4789/oomi.health.json',
  });

  assert.equal(result.ok, true);
  assert.equal(calls[0].url, 'https://api.oomi.ai/v1/persona_jobs/pj_123/succeed');
  assert.match(calls[0].options.body, /"workspacePath":"\/tmp\/chef"/);
  assert.match(calls[0].options.body, /"endpoint":"http:\/\/127.0.0.1:4789"/);
});

test('persona api client surfaces backend errors', async () => {
  const { fetchImpl } = createFetchRecorder({
    ok: false,
    status: 403,
    payload: { error: 'device is not linked for this persona owner' },
  });
  const client = createPersonaApiClient({
    backendUrl: 'https://api.oomi.ai',
    deviceToken: 'device-token',
    deviceId: 'device_123',
    fetchImpl,
  });

  await assert.rejects(
    () =>
      client.heartbeatRuntime({
        slug: 'chef',
        endpoint: 'http://127.0.0.1:4789',
        healthcheckUrl: 'http://127.0.0.1:4789/oomi.health.json',
        localPort: 4789,
      }),
    (error) => {
      assert.match(String(error?.message || ''), /device is not linked for this persona owner/);
      assert.equal(error?.status, 403);
      return true;
    },
  );
});
