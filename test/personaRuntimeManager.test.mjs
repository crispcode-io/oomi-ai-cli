import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';

import { findAvailablePort } from '../lib/personaPortAllocator.js';
import {
  destroyManagedPersonaRuntime,
  getManagedPersonaRuntimeStatus,
  slugifyPersonaName,
  stopManagedPersonaRuntime,
} from '../lib/personaRuntimeManager.js';
import {
  readPersonaRuntimeState,
  resolvePersonaRuntimeStatePath,
  resolvePersonaWorkspacePath,
  updatePersonaRuntimeState,
  writePersonaRuntimeState,
} from '../lib/personaRuntimeRegistry.js';

function createTempWorkspaceRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'oomi-persona-runtime-'));
}

function withEnv(overrides, fn) {
  const previous = {
    OPENCLAW_HOME: process.env.OPENCLAW_HOME,
    OPENCLAW_WORKSPACE: process.env.OPENCLAW_WORKSPACE,
  };

  if (Object.prototype.hasOwnProperty.call(overrides, 'OPENCLAW_HOME')) {
    if (overrides.OPENCLAW_HOME == null) {
      delete process.env.OPENCLAW_HOME;
    } else {
      process.env.OPENCLAW_HOME = String(overrides.OPENCLAW_HOME);
    }
  }

  if (Object.prototype.hasOwnProperty.call(overrides, 'OPENCLAW_WORKSPACE')) {
    if (overrides.OPENCLAW_WORKSPACE == null) {
      delete process.env.OPENCLAW_WORKSPACE;
    } else {
      process.env.OPENCLAW_WORKSPACE = String(overrides.OPENCLAW_WORKSPACE);
    }
  }

  try {
    return fn();
  } finally {
    if (previous.OPENCLAW_HOME == null) {
      delete process.env.OPENCLAW_HOME;
    } else {
      process.env.OPENCLAW_HOME = previous.OPENCLAW_HOME;
    }

    if (previous.OPENCLAW_WORKSPACE == null) {
      delete process.env.OPENCLAW_WORKSPACE;
    } else {
      process.env.OPENCLAW_WORKSPACE = previous.OPENCLAW_WORKSPACE;
    }
  }
}

async function listenOnEphemeralPort() {
  const server = net.createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  return {
    server,
    port: typeof address === 'object' && address ? address.port : 0,
  };
}

test('slugifyPersonaName normalizes display names into stable slugs', () => {
  assert.equal(slugifyPersonaName(' Market Analyst '), 'market-analyst');
  assert.equal(slugifyPersonaName('Chef++ Persona'), 'chef-persona');
});

test('persona runtime registry writes and updates state on disk', () => {
  const workspaceRoot = createTempWorkspaceRoot();
  const workspacePath = resolvePersonaWorkspacePath({
    workspaceRoot,
    slug: 'market-analyst',
  });

  writePersonaRuntimeState(workspacePath, {
    slug: 'market-analyst',
    localPort: 4789,
  });
  updatePersonaRuntimeState(workspacePath, {
    status: 'running',
  });

  const runtimeStatePath = resolvePersonaRuntimeStatePath(workspacePath);
  assert.equal(fs.existsSync(runtimeStatePath), true);
  assert.deepEqual(readPersonaRuntimeState(workspacePath), {
    slug: 'market-analyst',
    localPort: 4789,
    status: 'running',
  });
});

test('findAvailablePort prefers the requested port when it is free', async () => {
  const { server, port } = await listenOnEphemeralPort();
  await new Promise((resolve) => server.close(resolve));

  const availablePort = await findAvailablePort({
    preferredPort: port,
    maxAttempts: 3,
  });

  assert.equal(availablePort, port);
});

test('findAvailablePort moves to the next port when preferred port is busy', async () => {
  const { server, port } = await listenOnEphemeralPort();

  try {
    const availablePort = await findAvailablePort({
      preferredPort: port,
      maxAttempts: 3,
    });

    assert.equal(availablePort, port + 1);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('getManagedPersonaRuntimeStatus reports missing workspace without creating files', () => {
  const workspaceRoot = createTempWorkspaceRoot();
  const status = getManagedPersonaRuntimeStatus({
    slug: 'missing-persona',
    workspaceRoot,
  });

  assert.equal(status.workspaceExists, false);
  assert.equal(status.processRunning, false);
  assert.deepEqual(status.state, {});
});

test('getManagedPersonaRuntimeStatus promotes legacy persona workspaces into the OpenClaw workspace root', () => {
  const openclawHome = createTempWorkspaceRoot();
  const workspace = path.join(openclawHome, 'workspace');
  const legacyWorkspacePath = path.join(openclawHome, 'personas', 'chef');
  fs.mkdirSync(path.join(legacyWorkspacePath, '.oomi'), { recursive: true });
  fs.writeFileSync(path.join(legacyWorkspacePath, 'package.json'), '{"name":"chef"}\n', 'utf8');
  writePersonaRuntimeState(legacyWorkspacePath, {
    slug: 'chef',
    status: 'stopped',
  });

  withEnv(
    {
      OPENCLAW_HOME: openclawHome,
      OPENCLAW_WORKSPACE: workspace,
    },
    () => {
      const workspaceRoot = path.join(workspace, 'personas');
      const status = getManagedPersonaRuntimeStatus({
        slug: 'chef',
        workspaceRoot,
      });

      assert.equal(status.workspacePath, path.join(workspaceRoot, 'chef'));
      assert.equal(status.editableWorkspacePath, path.join(workspaceRoot, 'chef'));
      assert.equal(status.migratedFromLegacy, true);
      assert.equal(fs.existsSync(status.workspacePath), true);
      assert.equal(fs.existsSync(legacyWorkspacePath), true);
      assert.equal(fs.realpathSync(status.workspacePath), fs.realpathSync(legacyWorkspacePath));
    }
  );
});

test('stopManagedPersonaRuntime does not create runtime files for a missing workspace', async () => {
  const workspaceRoot = createTempWorkspaceRoot();
  const workspacePath = resolvePersonaWorkspacePath({
    workspaceRoot,
    slug: 'missing-persona',
  });

  const result = await stopManagedPersonaRuntime({
    slug: 'missing-persona',
    workspaceRoot,
  });

  assert.equal(result.ok, true);
  assert.equal(result.stopped, false);
  assert.equal(result.missingWorkspace, true);
  assert.equal(fs.existsSync(resolvePersonaRuntimeStatePath(workspacePath)), false);
});

test('destroyManagedPersonaRuntime removes the persona workspace', async () => {
  const workspaceRoot = createTempWorkspaceRoot();
  const workspacePath = resolvePersonaWorkspacePath({
    workspaceRoot,
    slug: 'delete-me',
  });
  fs.mkdirSync(path.join(workspacePath, '.oomi'), { recursive: true });
  fs.writeFileSync(path.join(workspacePath, 'package.json'), '{"name":"delete-me"}\n', 'utf8');
  writePersonaRuntimeState(workspacePath, {
    slug: 'delete-me',
    status: 'stopped',
  });

  const result = await destroyManagedPersonaRuntime({
    slug: 'delete-me',
    workspaceRoot,
  });

  assert.equal(result.ok, true);
  assert.equal(result.deleted, true);
  assert.equal(fs.existsSync(workspacePath), false);
});
