import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import {
  applyOpenclawProfile,
  buildOomiDevLocalProfile,
  readOpenclawProfile,
  writeOpenclawProfile,
} from '../lib/openclawProfile.js';

function makeTempDir(name) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `${name}-`));
}

test('buildOomiDevLocalProfile creates a deterministic local-dev profile', () => {
  const profile = buildOomiDevLocalProfile({
    profileId: 'chef-dev',
    label: 'Chef Dev',
    workspaceRoot: '/tmp/openclaw/workspace',
    deviceId: 'oomi-dev-openclaw-dev',
    gatewayPort: 19001,
    gatewayToken: 'gateway-token',
    backendUrl: 'http://127.0.0.1:3001',
    deviceToken: 'device-token',
    defaultSessionKey: 'agent:main:webchat:channel:oomi',
    enableOomiChannel: true,
    pluginTrustMode: 'plugins.allow',
    modelPreset: 'openrouter-free',
    modelAuthMode: 'provider-env',
  });

  assert.equal(profile.version, 1);
  assert.equal(profile.preset, 'oomi-dev-local');
  assert.equal(profile.profileId, 'chef-dev');
  assert.equal(profile.gateway.port, 19001);
  assert.equal(profile.gateway.auth.token, 'gateway-token');
  assert.equal(profile.device.id, 'oomi-dev-openclaw-dev');
  assert.equal(profile.oomiChannel.enabled, true);
  assert.equal(profile.oomiChannel.backendUrl, 'http://127.0.0.1:3001');
  assert.equal(profile.oomiChannel.pluginTrustMode, 'plugins.allow');
  assert.equal(profile.model.preset, 'openrouter-free');
  assert.equal(profile.model.authMode, 'provider-env');
});

test('buildOomiDevLocalProfile defaults model auth mode to oomi-managed', () => {
  const profile = buildOomiDevLocalProfile({
    profileId: 'default-auth-mode',
  });

  assert.equal(profile.model.authMode, 'oomi-managed');
});

test('applyOpenclawProfile writes config and identity for the target home', () => {
  const openclawHome = makeTempDir('oomi-openclaw-home');
  const configPath = path.join(openclawHome, 'openclaw.json');
  fs.writeFileSync(
    configPath,
    JSON.stringify(
      {
        plugins: {
          allow: ['legacy-plugin'],
        },
      },
      null,
      2
    ),
    'utf8'
  );

  const profile = buildOomiDevLocalProfile({
    profileId: 'oomi-dev-local',
    label: 'Oomi Local Dev',
    workspaceRoot: path.join(openclawHome, 'workspace'),
    deviceId: 'oomi-dev-openclaw-dev',
    gatewayPort: 18789,
    gatewayToken: 'dev-gateway-token',
    backendUrl: 'http://127.0.0.1:3001',
    deviceToken: 'device-token',
    enableOomiChannel: true,
  });

  const result = applyOpenclawProfile({
    profile,
    openclawHome,
    configPath,
    ensureIdentity: true,
  });

  const writtenConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  const identity = JSON.parse(fs.readFileSync(result.identityPath, 'utf8'));

  assert.equal(result.ok, true);
  assert.equal(result.pluginTrustMode, 'auto-discovery');
  assert.equal(result.oomiChannelEnabled, true);
  assert.equal(writtenConfig.gateway.port, 18789);
  assert.equal(writtenConfig.gateway.auth.token, 'dev-gateway-token');
  assert.equal(writtenConfig.plugins.allow, undefined);
  assert.equal(writtenConfig.channels.oomi.accounts.default.backendUrl, 'http://127.0.0.1:3001');
  assert.equal(writtenConfig.channels.oomi.accounts.default.deviceToken, 'device-token');
  assert.equal(identity.deviceId, 'oomi-dev-openclaw-dev');
});

test('oomi openclaw profile init and apply work through the CLI', () => {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const cliPath = path.join(repoRoot, 'bin', 'oomi-ai.js');
  const openclawHome = makeTempDir('oomi-openclaw-cli-home');
  const profilePath = path.join(openclawHome, 'oomi-dev-profile.json');

  const initResult = spawnSync(
    process.execPath,
    [
      cliPath,
      'openclaw',
      'profile',
      'init',
      '--profile',
      profilePath,
      '--profile-id',
      'docker-dev',
      '--label',
      'Docker Dev',
      '--device-id',
      'oomi-dev-openclaw-dev',
      '--backend-url',
      'http://127.0.0.1:3001',
      '--device-token',
      'device-token',
      '--gateway-token',
      'gateway-token',
      '--enable-channel',
      '--json',
    ],
    {
      env: {
        ...process.env,
        OOMI_SKIP_UPDATE_CHECK: '1',
      },
      encoding: 'utf8',
    }
  );

  assert.equal(initResult.status, 0, initResult.stderr || initResult.stdout);
  const initPayload = JSON.parse(initResult.stdout);
  assert.equal(initPayload.profile.profileId, 'docker-dev');
  assert.equal(readOpenclawProfile(profilePath).profileId, 'docker-dev');

  const applyResult = spawnSync(
    process.execPath,
    [
      cliPath,
      'openclaw',
      'profile',
      'apply',
      '--profile',
      profilePath,
      '--openclaw-home',
      openclawHome,
      '--json',
    ],
    {
      env: {
        ...process.env,
        OOMI_SKIP_UPDATE_CHECK: '1',
      },
      encoding: 'utf8',
    }
  );

  assert.equal(applyResult.status, 0, applyResult.stderr || applyResult.stdout);
  const applyPayload = JSON.parse(applyResult.stdout);
  const writtenConfig = JSON.parse(fs.readFileSync(applyPayload.configPath, 'utf8'));

  assert.equal(applyPayload.ok, true);
  assert.equal(applyPayload.profilePath, profilePath);
  assert.equal(writtenConfig.channels.oomi.accounts.default.deviceToken, 'device-token');
});

test('writeOpenclawProfile persists a readable profile', () => {
  const profileDir = makeTempDir('oomi-openclaw-profile');
  const profilePath = path.join(profileDir, 'profile.json');
  const profile = buildOomiDevLocalProfile({
    profileId: 'reader-test',
    label: 'Reader Test',
    gatewayToken: 'token',
  });

  writeOpenclawProfile(profilePath, profile);
  const readBack = readOpenclawProfile(profilePath);

  assert.deepEqual(readBack, profile);
});
