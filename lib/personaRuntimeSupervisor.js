import fs from 'node:fs';
import path from 'node:path';

import { resolveOpenclawLegacyPersonasDir } from './openclawPaths.js';
import { createPersonaApiClient } from './personaApiClient.js';
import { launchManagedPersonaRuntime } from './personaRuntimeManager.js';
import { readPersonaRuntimeState, updatePersonaRuntimeState } from './personaRuntimeRegistry.js';
import {
  buildLocalPersonaRuntime,
  isPersonaWorkspaceProcessRunning,
  resolvePersonaDevCommand,
  resolvePersonaHealthPath,
} from './personaRuntimeProcess.js';

function trimString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function wait(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function listWorkspacePaths(workspaceRoot) {
  const roots = [trimString(workspaceRoot), trimString(resolveOpenclawLegacyPersonasDir())]
    .filter(Boolean)
    .filter((root, index, values) => values.findIndex((candidate) => path.resolve(candidate) === path.resolve(root)) === index)
    .filter((root) => fs.existsSync(root));

  const workspacePaths = new Set();
  for (const root of roots) {
    for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
      if (!entry.isDirectory() && !entry.isSymbolicLink()) continue;
      const candidatePath = path.join(root, entry.name);
      let dedupeKey = candidatePath;
      try {
        dedupeKey = fs.realpathSync(candidatePath);
      } catch {
        // fall back to the visible path when the real path is unavailable
      }
      workspacePaths.add(dedupeKey);
    }
  }

  return Array.from(workspacePaths);
}

async function healthcheckOk(url) {
  const safeUrl = trimString(url);
  if (!safeUrl) {
    return false;
  }

  try {
    const response = await fetch(safeUrl, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
    });
    return response.ok;
  } catch {
    return false;
  }
}

async function reconcileWorkspace({
  workspacePath,
  workspaceRoot,
  client,
  logger,
  autoRestart,
}) {
  const state = readPersonaRuntimeState(workspacePath);
  const slug = trimString(state.slug);
  if (!slug || trimString(state.status) !== 'running') {
    return;
  }

  const runtime = {
    slug,
    endpoint: trimString(state.endpoint || state.entryUrl || state.localEndpoint),
    localEndpoint: trimString(state.localEndpoint),
    reachableEndpoint: trimString(state.reachableEndpoint),
    healthcheckUrl: trimString(state.healthcheckUrl),
    transport: trimString(state.transport) || 'local',
    localPort: Number.isFinite(Number(state.localPort)) ? Number(state.localPort) : null,
  };

  const localRuntime = runtime.localPort
    ? buildLocalPersonaRuntime({
        localPort: runtime.localPort,
        healthPath: resolvePersonaHealthPath({
          workspacePath,
          fallback: '/oomi.health.json',
        }),
      })
    : null;

  const expectedDevCommand = runtime.localPort
    ? resolvePersonaDevCommand({
        workspacePath,
        localPort: runtime.localPort,
      })
    : state.devCommand;
  const processRunning = isPersonaWorkspaceProcessRunning(state.pid, {
    workspacePath,
    expectedCommand: expectedDevCommand,
    localPort: runtime.localPort,
  });

  let effectiveRuntime = runtime;
  if (!processRunning) {
    if (!autoRestart) {
      return;
    }

    try {
      const launchResult = await launchManagedPersonaRuntime({
        slug,
        name: trimString(state.name) || slug,
        description: trimString(state.description) || trimString(state.name) || slug,
        workspaceRoot,
        templateVersion: trimString(state.templateVersion) || 'v1',
        forceInstall: false,
        restart: false,
        logFilePath: trimString(state.logFilePath),
        entryUrl: '',
        transport: 'local',
      });

      effectiveRuntime = {
        slug,
        endpoint: launchResult.runtime.endpoint,
        localEndpoint: launchResult.runtime.localEndpoint || launchResult.localRuntime.endpoint,
        reachableEndpoint: launchResult.runtime.reachableEndpoint || launchResult.localRuntime.reachableEndpoint,
        healthcheckUrl: launchResult.runtime.healthcheckUrl,
        transport: launchResult.runtime.transport,
        localPort: launchResult.runtime.localPort,
      };

      await client.registerRuntime({
        slug,
        endpoint: effectiveRuntime.endpoint,
        healthcheckUrl: effectiveRuntime.healthcheckUrl,
        localPort: effectiveRuntime.localPort,
        transport: effectiveRuntime.transport,
        startedAt: new Date().toISOString(),
      });
    } catch (error) {
      logger.warn?.(
        `[persona-runtime] restart failed for ${slug}: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
      return;
    }
  }

  const healthy = await healthcheckOk(effectiveRuntime.healthcheckUrl);
  if (!healthy) {
    if (!autoRestart) {
      return;
    }

    try {
      const recovered = await launchManagedPersonaRuntime({
        slug,
        name: trimString(state.name) || slug,
        description: trimString(state.description) || trimString(state.name) || slug,
        workspaceRoot,
        templateVersion: trimString(state.templateVersion) || 'v1',
        forceInstall: false,
        restart: true,
        logFilePath: trimString(state.logFilePath),
        entryUrl: '',
        transport: 'local',
      });

      effectiveRuntime = {
        slug,
        endpoint: recovered.runtime.endpoint,
        localEndpoint: recovered.runtime.localEndpoint || recovered.localRuntime.endpoint,
        reachableEndpoint: recovered.runtime.reachableEndpoint || recovered.localRuntime.reachableEndpoint,
        healthcheckUrl: recovered.runtime.healthcheckUrl,
        transport: recovered.runtime.transport,
        localPort: recovered.runtime.localPort,
      };

      await client.registerRuntime({
        slug,
        endpoint: effectiveRuntime.endpoint,
        healthcheckUrl: effectiveRuntime.healthcheckUrl,
        localPort: effectiveRuntime.localPort,
        transport: effectiveRuntime.transport,
        startedAt: new Date().toISOString(),
      });
    } catch (error) {
      logger.warn?.(
        `[persona-runtime] unhealthy runtime restart failed for ${slug}: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
      return;
    }
  }

  if (!healthy) {
    const recoveredHealthy = await healthcheckOk(effectiveRuntime.healthcheckUrl);
    if (!recoveredHealthy) {
      return;
    }
  }

  if (localRuntime) {
    const refreshedLocalRuntime = buildLocalPersonaRuntime({
      localPort: effectiveRuntime.localPort,
      healthPath: resolvePersonaHealthPath({
        workspacePath,
        fallback: '/oomi.health.json',
      }),
    });
    const desiredEndpoint = refreshedLocalRuntime.reachableEndpoint || runtime.endpoint;
    const endpointChanged = desiredEndpoint && desiredEndpoint !== effectiveRuntime.endpoint;
    const localEndpointChanged = refreshedLocalRuntime.endpoint !== effectiveRuntime.localEndpoint;
    const reachableEndpointChanged = refreshedLocalRuntime.reachableEndpoint !== effectiveRuntime.reachableEndpoint;

    if (endpointChanged || localEndpointChanged || reachableEndpointChanged) {
      effectiveRuntime = {
        ...effectiveRuntime,
        endpoint: desiredEndpoint,
        localEndpoint: refreshedLocalRuntime.endpoint,
        reachableEndpoint: refreshedLocalRuntime.reachableEndpoint,
      };
      updatePersonaRuntimeState(workspacePath, {
        endpoint: desiredEndpoint,
        entryUrl: desiredEndpoint,
        localEndpoint: refreshedLocalRuntime.endpoint,
        reachableEndpoint: refreshedLocalRuntime.reachableEndpoint,
        bindHost: refreshedLocalRuntime.bindHost,
        reachableHost: refreshedLocalRuntime.reachableHost,
      });

      try {
        await client.registerRuntime({
          slug,
          endpoint: effectiveRuntime.endpoint,
          healthcheckUrl: effectiveRuntime.healthcheckUrl,
          localPort: effectiveRuntime.localPort,
          transport: effectiveRuntime.transport,
          startedAt: new Date().toISOString(),
        });
      } catch (error) {
        logger.warn?.(
          `[persona-runtime] registration refresh failed for ${slug}: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
        return;
      }
    }
  }

  try {
    await client.heartbeatRuntime({
      slug,
      endpoint: effectiveRuntime.endpoint,
      healthcheckUrl: effectiveRuntime.healthcheckUrl,
      localPort: effectiveRuntime.localPort,
      transport: effectiveRuntime.transport,
      observedAt: new Date().toISOString(),
    });
  } catch (error) {
    logger.warn?.(
      `[persona-runtime] heartbeat failed for ${slug}: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}

export function startPersonaRuntimeSupervisor({
  backendUrl,
  deviceToken,
  workspaceRoot,
  fetchImpl = globalThis.fetch,
  intervalMs = 30000,
  logger = console,
  autoRestart = true,
}) {
  const client = createPersonaApiClient({
    backendUrl,
    deviceToken,
    fetchImpl,
  });

  let stopped = false;
  let loopPromise = null;

  async function runLoop() {
    while (!stopped) {
      const workspaces = listWorkspacePaths(workspaceRoot);
      for (const workspacePath of workspaces) {
        if (stopped) break;
        await reconcileWorkspace({
          workspacePath,
          workspaceRoot,
          client,
          logger,
          autoRestart,
        });
      }

      if (stopped) {
        break;
      }
      await wait(intervalMs);
    }
  }

  loopPromise = runLoop();

  return {
    stop() {
      stopped = true;
    },
    completed: loopPromise,
  };
}
