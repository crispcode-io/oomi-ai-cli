import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { executePersonaJob, extractPersonaJobPayload } from '../lib/personaJobExecutor.js';

function tempOutDir() {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'oomi-persona-job-')), 'workspace');
}

function buildMessage(overrides = {}) {
  return {
    metadata: {
      type: 'persona_job',
      jobId: 'pj_test_1',
      payload: {
        jobId: 'pj_test_1',
        jobType: 'create_persona_runtime',
        persona: {
          slug: 'market-analyst',
          name: 'Market Analyst',
          description: 'Private app for reviewing my broker positions and risk.',
          templateVersion: 'v1',
        },
        scaffold: {
          outDir: tempOutDir(),
        },
      },
    },
    ...overrides,
  };
}

test('extractPersonaJobPayload returns structured payload', () => {
  const payload = extractPersonaJobPayload(buildMessage());
  assert.equal(payload.jobType, 'create_persona_runtime');
  assert.equal(payload.persona.slug, 'market-analyst');
});

test('executePersonaJob scaffolds app and reports success payload', async () => {
  const calls = [];
  let registeredRuntime = null;
  const result = await executePersonaJob({
    message: buildMessage(),
    installWorkspace: async () => {},
    startWorkspace: async () => ({
      pid: 1234,
      logFilePath: '/tmp/market-analyst.log',
    }),
    waitForRuntime: async () => {},
    registerRuntime: async ({ result: payload }) => {
      registeredRuntime = payload;
    },
    onJobStart: async ({ jobId }) => {
      calls.push(['start', jobId]);
    },
    onJobSuccess: async ({ jobId, result: payload }) => {
      calls.push(['success', jobId, payload.localPort]);
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.result.localPort, 4789);
  assert.match(result.result.healthcheckUrl, /\/oomi\.health\.json$/);
  assert.equal(result.result.pid, 1234);
  assert.deepEqual(calls[0], ['start', 'pj_test_1']);
  assert.deepEqual(calls[1], ['success', 'pj_test_1', 4789]);
  assert.equal(registeredRuntime.endpoint, 'http://127.0.0.1:4789');
  assert.ok(fs.existsSync(path.join(result.result.workspacePath, 'oomi.runtime.json')));
});

test('executePersonaJob destroys persona workspaces for destroy jobs', async () => {
  const workspacePath = tempOutDir();
  const calls = [];
  const result = await executePersonaJob({
    message: buildMessage({
      metadata: {
        type: 'persona_job',
        jobId: 'pj_destroy_1',
        payload: {
          jobId: 'pj_destroy_1',
          jobType: 'destroy_persona_runtime',
          persona: {
            slug: 'market-analyst',
            name: 'Market Analyst',
            description: 'Private app for reviewing my broker positions and risk.',
            templateVersion: 'v1',
          },
          scaffold: {
            outDir: workspacePath,
          },
        },
      },
    }),
    destroyWorkspace: async ({ workspacePath: targetPath }) => {
      calls.push(['destroy', targetPath]);
      return {
        deleted: true,
      };
    },
    onJobStart: async ({ jobId }) => {
      calls.push(['start', jobId]);
    },
    onJobSuccess: async ({ jobId, result: payload }) => {
      calls.push(['success', jobId, payload.workspacePath]);
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.result.deleted, true);
  assert.deepEqual(calls[0], ['start', 'pj_destroy_1']);
  assert.deepEqual(calls[1], ['destroy', workspacePath]);
  assert.deepEqual(calls[2], ['success', 'pj_destroy_1', workspacePath]);
});

test('executePersonaJob reports failure for invalid payloads', async () => {
  let capturedFailure = null;
  const result = await executePersonaJob({
    message: {
      metadata: {
        type: 'persona_job',
        jobId: 'pj_test_2',
        payload: {
          jobId: 'pj_test_2',
          jobType: 'unsupported',
        },
      },
    },
    onJobFailure: async (payload) => {
      capturedFailure = payload;
    },
  });

  assert.equal(result.ok, false);
  assert.equal(capturedFailure.jobId, 'pj_test_2');
  assert.equal(capturedFailure.error.code, 'PERSONA_JOB_EXECUTION_FAILED');
});
