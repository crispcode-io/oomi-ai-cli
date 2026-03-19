import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

function trimString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

export function resolveOpenclawHome() {
  const explicitHome = trimString(process.env.OPENCLAW_HOME);
  if (explicitHome) {
    return path.resolve(explicitHome);
  }

  return path.join(os.homedir(), '.openclaw');
}

export function resolveOpenclawWorkspaceRoot() {
  const explicitWorkspace = trimString(process.env.OPENCLAW_WORKSPACE);
  if (explicitWorkspace) {
    return path.resolve(explicitWorkspace);
  }

  const openclawHome = resolveOpenclawHome();
  const managedWorkspace = path.join(openclawHome, 'workspace');
  if (fs.existsSync(managedWorkspace)) {
    return managedWorkspace;
  }

  return openclawHome;
}

export function resolveOpenclawLegacyPersonasDir() {
  return resolveOpenclawPath('personas');
}

export function resolveOpenclawPath(...parts) {
  return path.join(resolveOpenclawHome(), ...parts);
}

export function resolveOpenclawConfigCandidates() {
  return [
    resolveOpenclawPath('clawdbot.json'),
    resolveOpenclawPath('openclaw.json'),
  ];
}

export function resolveOpenclawSkillsDir() {
  return resolveOpenclawPath('skills');
}

export function resolveOpenclawPersonasDir() {
  const explicitPersonas = trimString(process.env.OPENCLAW_PERSONAS_DIR);
  if (explicitPersonas) {
    return path.resolve(explicitPersonas);
  }

  return path.join(resolveOpenclawWorkspaceRoot(), 'personas');
}

export function resolveOpenclawIdentityPath() {
  return resolveOpenclawPath('identity', 'device.json');
}

export function resolveOpenclawUpdateStatePath() {
  return resolveOpenclawPath('oomi-ai-update-check.json');
}

export function resolveOpenclawBridgeStatePath() {
  return resolveOpenclawPath('oomi-bridge.json');
}

export function resolveOpenclawBridgeStatusPath() {
  return resolveOpenclawPath('oomi-bridge-status.json');
}

export function resolveOpenclawBridgeLockPath() {
  return resolveOpenclawPath('oomi-bridge.lock');
}

export function resolveOpenclawBridgeLiveLogPath() {
  return resolveOpenclawPath('logs', 'oomi-bridge-live.log');
}

export function resolveOpenclawProfilePath(fileName = 'oomi-openclaw-profile.json') {
  return resolveOpenclawPath(fileName);
}
