import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

import {
  resolveOpenclawBridgeLiveLogPath,
  resolveOpenclawBridgeStatusPath,
  resolveOpenclawHome,
  resolveOpenclawLegacyPersonasDir,
  resolveOpenclawPersonasDir,
  resolveOpenclawWorkspaceRoot,
} from '../lib/openclawPaths.js';
import { defaultPersonaWorkspaceRoot } from '../lib/personaRuntimeProcess.js';

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

test('resolveOpenclaw paths honor OPENCLAW_HOME', () => {
  withEnv(
    {
      OPENCLAW_HOME: path.join('C:', 'temp', 'oomi-openclaw-home'),
      OPENCLAW_WORKSPACE: null,
    },
    () => {
      assert.equal(
        resolveOpenclawHome(),
        path.join('C:', 'temp', 'oomi-openclaw-home')
      );
      assert.equal(
        resolveOpenclawLegacyPersonasDir(),
        path.join('C:', 'temp', 'oomi-openclaw-home', 'personas')
      );
      assert.equal(
        resolveOpenclawPersonasDir(),
        path.join('C:', 'temp', 'oomi-openclaw-home', 'personas')
      );
      assert.equal(
        defaultPersonaWorkspaceRoot(),
        path.join('C:', 'temp', 'oomi-openclaw-home', 'personas')
      );
      assert.equal(
        resolveOpenclawBridgeStatusPath(),
        path.join('C:', 'temp', 'oomi-openclaw-home', 'oomi-bridge-status.json')
      );
      assert.equal(
        resolveOpenclawBridgeLiveLogPath(),
        path.join('C:', 'temp', 'oomi-openclaw-home', 'logs', 'oomi-bridge-live.log')
      );
    }
  );
});

test('resolveOpenclawWorkspaceRoot honors OPENCLAW_WORKSPACE when provided', () => {
  withEnv(
    {
      OPENCLAW_HOME: path.join('C:', 'temp', 'oomi-openclaw-home'),
      OPENCLAW_WORKSPACE: path.join('C:', 'temp', 'oomi-openclaw-workspace'),
    },
    () => {
      assert.equal(
        resolveOpenclawWorkspaceRoot(),
        path.join('C:', 'temp', 'oomi-openclaw-workspace')
      );
      assert.equal(
        resolveOpenclawPersonasDir(),
        path.join('C:', 'temp', 'oomi-openclaw-workspace', 'personas')
      );
    }
  );
});
