import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  collectManagedPersonaRefreshTargets,
  discoverBackendLinkedPersonaRefreshTargets,
  normalizeBackendPersonaRefreshRecord,
  resolvePersonaRuntimeInput,
  resolveExistingWorkspacePathForSlug,
} from '../bin/oomi-ai.js';

function createTempWorkspace() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'oomi-cli-runtime-input-'));
}

function withEnv(overrides, fn) {
  const previous = {};
  for (const [key, value] of Object.entries(overrides)) {
    previous[key] = process.env[key];
    if (value == null) {
      delete process.env[key];
    } else {
      process.env[key] = String(value);
    }
  }

  try {
    return fn();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value == null) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

test('resolvePersonaRuntimeInput publishes reachable LAN endpoint for local runtime registration', () => {
  const workspacePath = createTempWorkspace();
  fs.writeFileSync(
    path.join(workspacePath, 'oomi.runtime.json'),
    JSON.stringify({ renderMode: 'webspatial', healthPath: '/oomi.health.json' }, null, 2),
    'utf8',
  );

  const runtime = withEnv(
    {
      OOMI_PERSONA_PUBLIC_HOST: '192.168.50.161',
      OOMI_PERSONA_BIND_HOST: '',
    },
    () =>
      resolvePersonaRuntimeInput(
        { 'local-port': 4790 },
        {},
        { workspacePath },
      ),
  );

  assert.equal(runtime.endpoint, 'http://192.168.50.161:4790');
  assert.equal(runtime.localEndpoint, 'http://127.0.0.1:4790');
  assert.equal(runtime.healthcheckUrl, 'http://127.0.0.1:4790/webspatial/avp/oomi.health.json');
  assert.equal(runtime.localPort, 4790);
  assert.equal(runtime.transport, 'local');
});

test('resolvePersonaRuntimeInput keeps explicit endpoints untouched', () => {
  const runtime = resolvePersonaRuntimeInput({
    endpoint: 'https://runtime.oomi.ai/chef',
    'health-path': '/custom-health.json',
  });

  assert.equal(runtime.endpoint, 'https://runtime.oomi.ai/chef');
  assert.equal(runtime.healthcheckUrl, 'https://runtime.oomi.ai/chef/custom-health.json');
});

test('collectManagedPersonaRefreshTargets finds running managed persona workspaces', () => {
  const workspaceRoot = createTempWorkspace();
  const openclawHome = createTempWorkspace();
  const chefWorkspacePath = path.join(workspaceRoot, 'chef');
  const notesWorkspacePath = path.join(workspaceRoot, 'notes');
  fs.mkdirSync(path.join(chefWorkspacePath, '.oomi'), { recursive: true });
  fs.mkdirSync(notesWorkspacePath, { recursive: true });
  fs.writeFileSync(
    path.join(chefWorkspacePath, '.oomi', 'runtime.json'),
    JSON.stringify({
      slug: 'chef',
      name: 'Chef',
      description: 'Recipe helper',
      status: 'running',
    }, null, 2),
    'utf8',
  );

  const targets = withEnv(
    {
      OPENCLAW_HOME: openclawHome,
    },
    () => collectManagedPersonaRefreshTargets({ workspaceRoot }),
  );

  assert.equal(targets.length, 1);
  assert.equal(targets[0].slug, 'chef');
  assert.equal(path.resolve(targets[0].workspacePath), path.resolve(chefWorkspacePath));
});

test('normalizeBackendPersonaRefreshRecord prefers backend persona identifiers and summaries', () => {
  const normalized = normalizeBackendPersonaRefreshRecord({
    id: 'chef',
    name: 'Chef',
    summary: 'Recipe helper',
    promptTemplateVersion: 'v2',
  });

  assert.deepEqual(normalized, {
    slug: 'chef',
    name: 'Chef',
    description: 'Recipe helper',
    templateVersion: 'v2',
    templateType: '',
  });
});

test('resolveExistingWorkspacePathForSlug finds an existing persona workspace', () => {
  const workspaceRoot = createTempWorkspace();
  const chefWorkspacePath = path.join(workspaceRoot, 'chef');
  fs.mkdirSync(chefWorkspacePath, { recursive: true });

  const resolved = resolveExistingWorkspacePathForSlug('chef', workspaceRoot);

  assert.equal(path.resolve(resolved), path.resolve(chefWorkspacePath));
});

test('discoverBackendLinkedPersonaRefreshTargets adds backend personas with matching local workspaces', async () => {
  const workspaceRoot = createTempWorkspace();
  const chefWorkspacePath = path.join(workspaceRoot, 'chef');
  fs.mkdirSync(path.join(chefWorkspacePath, '.oomi'), { recursive: true });
  fs.writeFileSync(
    path.join(chefWorkspacePath, '.oomi', 'runtime.json'),
    JSON.stringify({
      slug: 'chef',
      localPort: 4790,
      status: 'stopped',
    }, null, 2),
    'utf8',
  );

  const discovered = await discoverBackendLinkedPersonaRefreshTargets({
    client: {
      async listPersonas() {
        return {
          personas: [
            {
              id: 'chef',
              name: 'Chef',
              description: 'Recipe helper',
              promptTemplateVersion: 'v1',
            },
          ],
        };
      },
    },
    workspaceRoot,
    existingTargets: [],
  });

  assert.equal(discovered.length, 1);
  assert.equal(discovered[0].slug, 'chef');
  assert.equal(path.resolve(discovered[0].workspacePath), path.resolve(chefWorkspacePath));
  assert.equal(discovered[0].state.name, 'Chef');
  assert.equal(discovered[0].state.description, 'Recipe helper');
  assert.equal(discovered[0].state.localPort, 4790);
  assert.equal(discovered[0].processRunning, false);
});
