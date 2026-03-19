import fs from 'node:fs';
import path from 'node:path';

import { findAvailablePort } from './personaPortAllocator.js';
import { resolveOpenclawLegacyPersonasDir } from './openclawPaths.js';
import {
  buildLocalPersonaRuntime,
  defaultPersonaWorkspaceRoot,
  installPersonaWorkspace,
  isPersonaWorkspaceProcessRunning,
  resolvePersonaHealthPath,
  resolvePersonaDevCommand,
  syncLegacyWebSpatialScaffoldFiles,
  syncVendoredWebSpatialPackages,
  startPersonaWorkspace,
  stopPersonaWorkspace,
  waitForPersonaRuntime,
} from './personaRuntimeProcess.js';
import {
  readPersonaRuntimeState,
  resolvePersonaRuntimeLogPath,
  resolvePersonaRuntimeStatePath,
  resolvePersonaWorkspacePath,
  updatePersonaRuntimeState,
} from './personaRuntimeRegistry.js';
import { scaffoldPersonaApp } from './scaffold.js';

function trimString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function samePath(a, b) {
  return path.resolve(String(a || '')) === path.resolve(String(b || ''));
}

function pathExists(targetPath) {
  return Boolean(targetPath) && fs.existsSync(targetPath);
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function ensureDirectoryLink(linkPath, targetPath) {
  if (!linkPath || !targetPath || samePath(linkPath, targetPath) || pathExists(linkPath)) {
    return false;
  }

  ensureDir(path.dirname(linkPath));
  try {
    fs.symlinkSync(
      targetPath,
      linkPath,
      process.platform === 'win32' ? 'junction' : 'dir'
    );
    return true;
  } catch {
    return false;
  }
}

function resolveManagedPersonaWorkspacePaths({
  slug,
  workspaceRoot = defaultPersonaWorkspaceRoot(),
}) {
  const canonicalWorkspaceRoot = path.resolve(workspaceRoot);
  const canonicalWorkspacePath = resolvePersonaWorkspacePath({
    workspaceRoot: canonicalWorkspaceRoot,
    slug,
  });
  const legacyWorkspaceRoot = path.resolve(resolveOpenclawLegacyPersonasDir());
  const legacyWorkspacePath = samePath(canonicalWorkspaceRoot, legacyWorkspaceRoot)
    ? ''
    : resolvePersonaWorkspacePath({
        workspaceRoot: legacyWorkspaceRoot,
        slug,
      });

  return {
    canonicalWorkspaceRoot,
    canonicalWorkspacePath,
    legacyWorkspaceRoot: legacyWorkspacePath ? legacyWorkspaceRoot : '',
    legacyWorkspacePath,
  };
}

function resolveManagedPersonaWorkspace({
  slug,
  workspaceRoot = defaultPersonaWorkspaceRoot(),
}) {
  const paths = resolveManagedPersonaWorkspacePaths({ slug, workspaceRoot });
  ensureDir(paths.canonicalWorkspaceRoot);

  let migratedFromLegacy = false;
  let canonicalProxyCreated = false;
  let legacyProxyCreated = false;

  if (!pathExists(paths.canonicalWorkspacePath) && pathExists(paths.legacyWorkspacePath)) {
    try {
      fs.renameSync(paths.legacyWorkspacePath, paths.canonicalWorkspacePath);
      migratedFromLegacy = true;
    } catch {
      canonicalProxyCreated = ensureDirectoryLink(
        paths.canonicalWorkspacePath,
        paths.legacyWorkspacePath
      );
    }
  }

  if (pathExists(paths.canonicalWorkspacePath) && paths.legacyWorkspacePath && !pathExists(paths.legacyWorkspacePath)) {
    legacyProxyCreated = ensureDirectoryLink(
      paths.legacyWorkspacePath,
      paths.canonicalWorkspacePath
    );
  }

  const workspacePath = pathExists(paths.canonicalWorkspacePath)
    ? paths.canonicalWorkspacePath
    : (pathExists(paths.legacyWorkspacePath) ? paths.legacyWorkspacePath : paths.canonicalWorkspacePath);

  return {
    ...paths,
    workspacePath,
    editableWorkspacePath: pathExists(paths.canonicalWorkspacePath)
      ? paths.canonicalWorkspacePath
      : workspacePath,
    migratedFromLegacy,
    canonicalProxyCreated,
    legacyProxyCreated,
  };
}

export function slugifyPersonaName(name) {
  const normalized = trimString(name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');

  if (!normalized) {
    throw new Error('Persona name must include at least one letter or number.');
  }

  return normalized;
}

function resolveHealthPath(workspacePath) {
  return resolvePersonaHealthPath({
    workspacePath,
    fallback: '/oomi.health.json',
  });
}

function workspaceNeedsScaffold(workspacePath) {
  return !fs.existsSync(path.join(workspacePath, 'package.json'));
}

async function ensureWorkspaceScaffold({
  slug,
  name,
  description,
  workspacePath,
  templateVersion,
}) {
  if (!workspaceNeedsScaffold(workspacePath)) {
    return {
      scaffolded: false,
      workspacePath,
      healthPath: resolveHealthPath(workspacePath),
      defaultPort: 4789,
    };
  }

  const scaffoldResult = scaffoldPersonaApp({
    slug,
    name,
    description,
    outDir: workspacePath,
    templateVersion,
    force: false,
  });

  return {
    scaffolded: true,
    workspacePath,
    healthPath: scaffoldResult.healthPath,
    defaultPort: scaffoldResult.defaultPort,
  };
}

async function ensureWorkspaceInstall({
  workspacePath,
  forceInstall = false,
}) {
  const packageSyncChanged = syncVendoredWebSpatialPackages({ workspacePath });
  syncLegacyWebSpatialScaffoldFiles({ workspacePath });
  const nodeModulesPath = path.join(workspacePath, 'node_modules');
  if (!forceInstall && fs.existsSync(nodeModulesPath) && !packageSyncChanged) {
    return false;
  }

  await installPersonaWorkspace({ workspacePath });
  return true;
}

function buildRuntimeRegistration({
  localRuntime,
  entryUrl,
  transport,
}) {
  const safeEntryUrl = trimString(entryUrl);
  if (safeEntryUrl) {
    return {
      endpoint: safeEntryUrl,
      transport: trimString(transport) || 'relay',
      healthcheckUrl: localRuntime.healthcheckUrl,
      localPort: localRuntime.localPort,
      localEndpoint: localRuntime.endpoint,
      reachableEndpoint: localRuntime.reachableEndpoint,
    };
  }

  return {
    endpoint: localRuntime.reachableEndpoint || localRuntime.endpoint,
    transport: trimString(transport) || localRuntime.transport,
    healthcheckUrl: localRuntime.healthcheckUrl,
    localPort: localRuntime.localPort,
    localEndpoint: localRuntime.endpoint,
    reachableEndpoint: localRuntime.reachableEndpoint,
  };
}

export async function launchManagedPersonaRuntime({
  slug,
  name,
  description,
  workspaceRoot = defaultPersonaWorkspaceRoot(),
  templateVersion = 'v1',
  forceInstall = false,
  restart = false,
  logFilePath = '',
  entryUrl = '',
  transport = '',
} = {}) {
  const safeName = trimString(name);
  const safeDescription = trimString(description) || safeName;
  if (!safeName) {
    throw new Error('Persona name is required.');
  }

  const safeSlug = trimString(slug) || slugifyPersonaName(safeName);
  const workspaceResolution = resolveManagedPersonaWorkspace({
    slug: safeSlug,
    workspaceRoot,
  });
  const workspacePath = workspaceResolution.workspacePath;
  const previousState = readPersonaRuntimeState(workspacePath);

  const scaffoldInfo = await ensureWorkspaceScaffold({
    slug: safeSlug,
    name: safeName,
    description: safeDescription,
    workspacePath,
    templateVersion,
  });
  const installed = await ensureWorkspaceInstall({
    workspacePath,
    forceInstall,
  });

  const healthPath = resolveHealthPath(workspacePath);
  const preferredPort = previousState.localPort || scaffoldInfo.defaultPort;
  const expectedDevCommand = resolvePersonaDevCommand({
    workspacePath,
    localPort: preferredPort,
  });

  let reusingRunningProcess = false;
  if (
    !restart &&
    Number.isInteger(previousState.pid) &&
    isPersonaWorkspaceProcessRunning(previousState.pid, {
      workspacePath,
      expectedCommand: expectedDevCommand,
      localPort: preferredPort,
    })
  ) {
    try {
      await waitForPersonaRuntime({
        healthcheckUrl: previousState.healthcheckUrl || buildLocalPersonaRuntime({
          localPort: preferredPort,
          healthPath,
        }).healthcheckUrl,
        timeoutMs: 4000,
        intervalMs: 500,
      });
      reusingRunningProcess = true;
    } catch {
      reusingRunningProcess = false;
    }
  }

  if (restart && Number.isInteger(previousState.pid) && isPersonaWorkspaceProcessRunning(previousState.pid)) {
    await stopPersonaWorkspace({ pid: previousState.pid });
  }

  const localPort = reusingRunningProcess
    ? previousState.localPort
    : await findAvailablePort({
        preferredPort,
      });
  const localRuntime = buildLocalPersonaRuntime({
    localPort,
    healthPath,
  });

  let processInfo = {
    pid: Number.isInteger(previousState.pid) ? previousState.pid : null,
    logFilePath: trimString(previousState.logFilePath) || resolvePersonaRuntimeLogPath(workspacePath),
  };

  if (!reusingRunningProcess) {
    processInfo = startPersonaWorkspace({
      workspacePath,
      logFilePath: logFilePath || resolvePersonaRuntimeLogPath(workspacePath),
      localPort,
    });
    await waitForPersonaRuntime({
      healthcheckUrl: localRuntime.healthcheckUrl,
    });
  }

  const registration = buildRuntimeRegistration({
    localRuntime,
    entryUrl,
    transport,
  });
  const runtimeState = updatePersonaRuntimeState(workspacePath, {
    slug: safeSlug,
    name: safeName,
    description: safeDescription,
    workspacePath,
    templateVersion,
    localPort: localRuntime.localPort,
    localEndpoint: localRuntime.endpoint,
    reachableEndpoint: localRuntime.reachableEndpoint,
    bindHost: localRuntime.bindHost,
    reachableHost: localRuntime.reachableHost,
    endpoint: registration.endpoint,
    entryUrl: registration.endpoint,
    transport: registration.transport,
    healthcheckUrl: localRuntime.healthcheckUrl,
    pid: processInfo.pid,
    logFilePath: processInfo.logFilePath,
    status: 'running',
    lastStartedAt: new Date().toISOString(),
    devCommand: resolvePersonaDevCommand({ workspacePath, localPort }),
  });

  return {
    ok: true,
    slug: safeSlug,
    workspacePath,
    editableWorkspacePath: workspaceResolution.editableWorkspacePath,
    compatibilityWorkspacePath: workspaceResolution.legacyWorkspacePath || '',
    migratedFromLegacy: workspaceResolution.migratedFromLegacy,
    scaffolded: scaffoldInfo.scaffolded,
    installed,
    reusedRunningProcess: reusingRunningProcess,
    runtime: registration,
    localRuntime,
    state: runtimeState,
  };
}

export function getManagedPersonaRuntimeStatus({
  slug,
  workspaceRoot = defaultPersonaWorkspaceRoot(),
}) {
  const safeSlug = trimString(slug);
  if (!safeSlug) {
    throw new Error('Persona slug is required.');
  }

  const workspaceResolution = resolveManagedPersonaWorkspace({
    slug: safeSlug,
    workspaceRoot,
  });
  const workspacePath = workspaceResolution.workspacePath;
  const state = readPersonaRuntimeState(workspacePath);
  const pid = Number.isInteger(state.pid) ? state.pid : null;

  return {
    slug: safeSlug,
    workspaceRoot: workspaceResolution.canonicalWorkspaceRoot,
    workspacePath,
    editableWorkspacePath: workspaceResolution.editableWorkspacePath,
    compatibilityWorkspacePath: workspaceResolution.legacyWorkspacePath || '',
    workspaceExists: fs.existsSync(workspacePath),
    runtimeStatePath: resolvePersonaRuntimeStatePath(workspacePath),
    processRunning: pid ? isPersonaWorkspaceProcessRunning(pid) : false,
    migratedFromLegacy: workspaceResolution.migratedFromLegacy,
    canonicalProxyCreated: workspaceResolution.canonicalProxyCreated,
    legacyProxyCreated: workspaceResolution.legacyProxyCreated,
    state,
  };
}

export async function stopManagedPersonaRuntime({
  slug,
  workspaceRoot = defaultPersonaWorkspaceRoot(),
}) {
  const status = getManagedPersonaRuntimeStatus({ slug, workspaceRoot });
  if (!status.workspaceExists) {
    return {
      ok: true,
      stopped: false,
      missingWorkspace: true,
      workspacePath: status.workspacePath,
      state: status.state,
    };
  }

  const pid = Number.isInteger(status.state.pid) ? status.state.pid : null;
  if (!pid) {
    const nextState = updatePersonaRuntimeState(status.workspacePath, {
      status: 'stopped',
      stoppedAt: new Date().toISOString(),
    });
    return {
      ok: true,
      stopped: false,
      state: nextState,
      workspacePath: status.workspacePath,
    };
  }

  await stopPersonaWorkspace({ pid });
  const nextState = updatePersonaRuntimeState(status.workspacePath, {
    status: 'stopped',
    stoppedAt: new Date().toISOString(),
  });

  return {
    ok: true,
    stopped: true,
    state: nextState,
    workspacePath: status.workspacePath,
  };
}

function ensureWorkspacePathWithinRoot(workspacePath, workspaceRoot) {
  const resolvedWorkspacePath = path.resolve(workspacePath);
  const resolvedRoot = path.resolve(workspaceRoot);
  const relative = path.relative(resolvedRoot, resolvedWorkspacePath);
  if (
    relative === '' ||
    relative.startsWith('..') ||
    path.isAbsolute(relative)
  ) {
    throw new Error(`Refusing to delete workspace outside persona root: ${resolvedWorkspacePath}`);
  }
}

export async function destroyManagedPersonaRuntime({
  slug,
  workspaceRoot = defaultPersonaWorkspaceRoot(),
}) {
  const status = getManagedPersonaRuntimeStatus({ slug, workspaceRoot });
  if (!status.workspaceExists) {
    return {
      ok: true,
      deleted: false,
      missingWorkspace: true,
      workspacePath: status.workspacePath,
      state: status.state,
    };
  }

  const stopResult = await stopManagedPersonaRuntime({
    slug,
    workspaceRoot,
  });
  ensureWorkspacePathWithinRoot(status.workspacePath, status.workspaceRoot || workspaceRoot);
  fs.rmSync(status.workspacePath, { recursive: true, force: true });
  if (status.compatibilityWorkspacePath && pathExists(status.compatibilityWorkspacePath)) {
    fs.rmSync(status.compatibilityWorkspacePath, { recursive: true, force: true });
  }

  return {
    ok: true,
    deleted: true,
    stopped: Boolean(stopResult.stopped),
    workspacePath: status.workspacePath,
  };
}
