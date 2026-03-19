import fs from 'node:fs';
import path from 'node:path';

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function readJsonSafe(filePath) {
  if (!fs.existsSync(filePath)) {
    return null;
  }

  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function trimString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

export function resolvePersonaWorkspacePath({ workspaceRoot, slug }) {
  const safeRoot = trimString(workspaceRoot);
  const safeSlug = trimString(slug);
  if (!safeRoot) {
    throw new Error('Workspace root is required.');
  }
  if (!safeSlug) {
    throw new Error('Persona slug is required.');
  }

  return path.resolve(safeRoot, safeSlug);
}

export function resolvePersonaRuntimeDir(workspacePath) {
  return path.join(workspacePath, '.oomi');
}

export function resolvePersonaRuntimeStatePath(workspacePath) {
  return path.join(resolvePersonaRuntimeDir(workspacePath), 'runtime.json');
}

export function resolvePersonaRuntimeLogPath(workspacePath) {
  return path.join(resolvePersonaRuntimeDir(workspacePath), 'runtime.log');
}

export function readPersonaRuntimeState(workspacePath) {
  return readJsonSafe(resolvePersonaRuntimeStatePath(workspacePath)) || {};
}

export function writePersonaRuntimeState(workspacePath, state) {
  const runtimeDir = resolvePersonaRuntimeDir(workspacePath);
  const statePath = resolvePersonaRuntimeStatePath(workspacePath);
  ensureDir(runtimeDir);
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2) + '\n', 'utf8');
  return state;
}

export function updatePersonaRuntimeState(workspacePath, partial) {
  const current = readPersonaRuntimeState(workspacePath);
  return writePersonaRuntimeState(workspacePath, {
    ...current,
    ...partial,
  });
}
