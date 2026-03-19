#!/usr/bin/env node
import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawn, spawnSync } from 'child_process';
import { createPrivateKey, createPublicKey, randomUUID, sign as cryptoSign } from 'crypto';
import net from 'net';
import { lookup as dnsLookup } from 'dns/promises';
import { fileURLToPath } from 'url';
import WebSocket from 'ws';
import { scaffoldPersonaApp } from '../lib/scaffold.js';
import { createPersonaApiClient } from '../lib/personaApiClient.js';
import { startPersonaJobPoller } from '../lib/personaJobPoller.js';
import { startPersonaRuntimeSupervisor } from '../lib/personaRuntimeSupervisor.js';
import { executePersonaJob, extractPersonaJobPayload } from '../lib/personaJobExecutor.js';
import { inferSpokenMetadataFromContent, normalizeSpokenMetadata } from '../lib/spokenMetadata.js';
import {
  resolveOpenclawBridgeLiveLogPath,
  resolveOpenclawBridgeLockPath,
  resolveOpenclawBridgeStatePath,
  resolveOpenclawBridgeStatusPath,
  resolveOpenclawConfigCandidates,
  resolveOpenclawHome,
  resolveOpenclawIdentityPath,
  resolveOpenclawLegacyPersonasDir,
  resolveOpenclawProfilePath,
  resolveOpenclawSkillsDir,
  resolveOpenclawUpdateStatePath,
  resolveOpenclawWorkspaceRoot,
} from '../lib/openclawPaths.js';
import {
  applyOpenclawProfile,
  buildOomiDevLocalProfile,
  readOpenclawProfile,
  writeOpenclawProfile,
} from '../lib/openclawProfile.js';
import {
  buildLocalPersonaRuntime,
  defaultPersonaWorkspaceRoot,
  installPersonaWorkspace,
  isPersonaWorkspaceProcessRunning,
  resolvePersonaHealthPath,
  resolvePersonaDevCommand,
  startPersonaWorkspace,
  stopPersonaWorkspace,
  waitForPersonaRuntime,
} from '../lib/personaRuntimeProcess.js';
import {
  destroyManagedPersonaRuntime,
  getManagedPersonaRuntimeStatus,
  launchManagedPersonaRuntime,
  slugifyPersonaName,
  stopManagedPersonaRuntime,
} from '../lib/personaRuntimeManager.js';
import {
  readPersonaRuntimeState,
  resolvePersonaWorkspacePath,
} from '../lib/personaRuntimeRegistry.js';
import { startLocalGatewayAgentServer } from '../lib/openclawDevGateway.js';
import { ensureSessionBridge, flushSessionQueue, flushWaitingForConnect, forwardFrameToSession } from './sessionBridgeState.js';

const MARKER_START = '<oomi-agent-instructions>';
const MARKER_END = '</oomi-agent-instructions>';

const PACKAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const UPDATE_STATE_FILE = resolveOpenclawUpdateStatePath();
const DEFAULT_UPDATE_CHECK_INTERVAL_MS = 12 * 60 * 60 * 1000;
const DEFAULT_UPDATE_CHECK_TIMEOUT_MS = 1200;
const BRIDGE_RECONNECT_BASE_MS = 2000;
const BRIDGE_RECONNECT_MAX_MS = 60000;
const BRIDGE_GATEWAY_CONNECT_TIMEOUT_MS = parsePositiveInteger(
  process.env.OOMI_BRIDGE_GATEWAY_CONNECT_TIMEOUT_MS,
  10000
);
const BRIDGE_CONNECT_CHALLENGE_TIMEOUT_MS = parsePositiveInteger(
  process.env.OOMI_BRIDGE_CONNECT_CHALLENGE_TIMEOUT_MS,
  3000
);
const BRIDGE_GATEWAY_REQUEST_TIMEOUT_MS = parsePositiveInteger(
  process.env.OOMI_BRIDGE_GATEWAY_REQUEST_TIMEOUT_MS,
  30000
);
const BRIDGE_LAUNCHD_LABEL = 'ai.oomi.bridge';
const DEBUG_PROVIDER_ENV_KEYS = [
  'QWEN_REALTIME_API_KEY',
  'QWEN_REALTIME_BASE_URL',
  'QWEN_REALTIME_ASR_MODEL',
  'QWEN_REALTIME_TTS_MODEL',
  'QWEN_REALTIME_TTS_VOICE',
  'QWEN_REALTIME_LANGUAGE',
];
const DEVICE_IDENTITY_PATH = resolveOpenclawIdentityPath();
const ED25519_SPKI_PREFIX = Buffer.from('302a300506032b6570032100', 'hex');
const BRIDGE_DEBUG_ENABLED = process.env.OOMI_BRIDGE_DEBUG === '1';

function bridgeDebugLog(...args) {
  if (!BRIDGE_DEBUG_ENABLED) return;
  console.log(...args);
}

function bridgeDebugWarn(...args) {
  if (!BRIDGE_DEBUG_ENABLED) return;
  console.warn(...args);
}

function parsePositiveInteger(value, fallback) {
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) return fallback;
  return Math.floor(num);
}

function readJsonSafe(filePath) {
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(readFile(filePath));
  } catch {
    return null;
  }
}

function writeJsonSafe(filePath, value) {
  try {
    ensureDir(path.dirname(filePath));
    writeFile(filePath, JSON.stringify(value, null, 2) + '\n');
  } catch {
    // best-effort cache write
  }
}

function currentPackageVersion() {
  const packageJsonPath = path.join(PACKAGE_ROOT, 'package.json');
  const packageJson = readJsonSafe(packageJsonPath);
  const version = typeof packageJson?.version === 'string' ? packageJson.version.trim() : '';
  return version;
}

function parseVersionTuple(version) {
  if (typeof version !== 'string') return null;
  const cleaned = version.trim().replace(/^v/i, '').split('-')[0];
  const parts = cleaned.split('.');
  if (parts.length < 3) return null;
  const major = Number(parts[0]);
  const minor = Number(parts[1]);
  const patch = Number(parts[2]);
  if (![major, minor, patch].every((n) => Number.isInteger(n) && n >= 0)) return null;
  return [major, minor, patch];
}

function compareVersions(a, b) {
  const av = parseVersionTuple(a);
  const bv = parseVersionTuple(b);
  if (!av || !bv) return 0;
  for (let i = 0; i < 3; i += 1) {
    if (av[i] < bv[i]) return -1;
    if (av[i] > bv[i]) return 1;
  }
  return 0;
}

async function fetchLatestPublishedVersion(pkgName) {
  const timeoutMs = parsePositiveInteger(
    process.env.OOMI_UPDATE_CHECK_TIMEOUT_MS,
    DEFAULT_UPDATE_CHECK_TIMEOUT_MS
  );
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`https://registry.npmjs.org/${encodeURIComponent(pkgName)}/latest`, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
      signal: controller.signal,
    });
    if (!response.ok) return '';
    const payload = await response.json().catch(() => ({}));
    const version = typeof payload?.version === 'string' ? payload.version.trim() : '';
    return version;
  } catch {
    return '';
  } finally {
    clearTimeout(timer);
  }
}

async function maybeNotifyUpdate(command) {
  if (isTruthyFlag(process.env.OOMI_SKIP_UPDATE_CHECK)) return;
  if (!command || command === 'help' || command === '--help') return;

  const currentVersion = currentPackageVersion();
  if (!currentVersion) return;

  const intervalMs = parsePositiveInteger(
    process.env.OOMI_UPDATE_CHECK_INTERVAL_MS,
    DEFAULT_UPDATE_CHECK_INTERVAL_MS
  );
  const now = Date.now();
  const state = readJsonSafe(UPDATE_STATE_FILE) || {};
  const lastCheckedAt = Number(state.lastCheckedAt || 0);
  if (Number.isFinite(lastCheckedAt) && lastCheckedAt > 0 && now - lastCheckedAt < intervalMs) {
    return;
  }

  const latestVersion = await fetchLatestPublishedVersion('oomi-ai');
  writeJsonSafe(UPDATE_STATE_FILE, {
    lastCheckedAt: now,
    latestVersion: latestVersion || String(state.latestVersion || ''),
  });
  if (!latestVersion) return;

  if (compareVersions(currentVersion, latestVersion) < 0) {
    console.warn(`[oomi] Update available: oomi-ai ${currentVersion} -> ${latestVersion}`);
    console.warn('[oomi] Update command: pnpm add -g oomi-ai@latest');
    console.warn('[oomi] Fallback update command: npm install -g oomi-ai@latest');
  }
}

function usage() {
  console.log(`oomi <command>

Commands:
  init
    Install Oomi agent instructions into OpenClaw AGENTS.md.

  openclaw install
    Install agent instructions and the Oomi skill into OpenClaw.

  openclaw bridge [start|ensure|stop|restart|ps]
    Manage local OpenClaw-to-Oomi bridge lifecycle (singleton).
  openclaw bridge service [install|start|stop|restart|status|uninstall]
    Manage macOS launchd bridge supervision.
  openclaw profile init
    Write a deterministic OpenClaw profile for local/dev or hosted setup flows.
  openclaw profile apply
    Apply an OpenClaw profile into the current OpenClaw home/config.
  openclaw debug assistant-final
    Replay an assistant chat.final frame through spoken-metadata normalization.
  openclaw debug tts-pipeline
    Replay an assistant chat.final through local backend voice handling.
  openclaw debug local-gateway-agent
    Run a tiny local OpenClaw gateway/agent for Docker dev testing.
  openclaw debug persona-runtime
    Scaffold, launch, and stop a managed persona runtime locally.
  openclaw refresh
    Restart the bridge and running managed persona runtimes after an oomi-ai update.

  openclaw pair
    Pair this OpenClaw host with Oomi and start bridge (single command).

  openclaw invite
    Create a single-use auth invite link for the paired OpenClaw device.

  openclaw plugin
    Print OpenClaw extension install/config guidance for Oomi channel plugin.

  openclaw status
    Show bridge state + runtime health from local status files.

  personas sync
    Sync personas from the repo into the Oomi backend registry.

  personas create <id>
    Create a new persona manifest for local or repo work. For managed Oomi personas prefer create-managed.
  personas create-managed [slug]
    Create the managed persona record in Oomi. Run this before manual launch-managed, runtime-register, or heartbeat flows.
  personas launch-managed [slug]
    Launch or reuse a managed persona runtime on this OpenClaw machine and register a client-reachable runtime URL. Prefer scaffold + create-managed first.
  personas scaffold <slug>
    Create an Oomi-managed persona app scaffold for agent customization.
  personas status <slug>
    Show local managed persona runtime state for a persona slug.
  personas stop <slug>
    Stop a locally running managed persona runtime.
  personas delete <slug>
    Stop a managed persona runtime and remove its workspace from this OpenClaw machine.
  personas runtime-register <slug>
    Register a running persona runtime with the Oomi backend. Recovery-only after create-managed. Prefer --local-port so the CLI can derive a reachable endpoint.
  personas heartbeat <slug>
    Send a persona runtime heartbeat to the Oomi backend. Recovery-only after launch-managed wrote .oomi/runtime.json.
  personas runtime-fail <slug>
    Report persona runtime failure to the Oomi backend.
  persona-jobs start <jobId>
    Mark a persona job as running.
  persona-jobs succeed <jobId>
    Mark a persona job as succeeded.
  persona-jobs fail <jobId>
    Mark a persona job as failed.
  persona-jobs execute
    Execute a structured persona job payload end to end.

Common flags:
  --agents-file PATH     Override AGENTS.md path
  --workspace PATH       Override OpenClaw workspace root
  --skills-dir PATH      Override skills install dir
  --broker-http URL      Managed broker HTTPS URL (for pair claim)
  --broker-ws URL        Managed broker device WS URL (wss://.../cable)
  --pair-code CODE       One-time pairing code from Oomi
  --app-url URL          Oomi app URL used for pairing APIs; bridge can also refresh managed broker URLs from it
  --label TEXT           Pairing label shown in broker logs
  --session-key KEY      Session key used in generated connect URL
  --detach               Start bridge in background and exit
  --no-start             Do not start the bridge or persona runtime
  --device-id ID         Bridge device identifier (default: host name)
  --device-token TOKEN   Existing bridge device token
  --show-secrets         Print full token values in diagnostic output
  --json                 Print pairing result as JSON (for automation)
  --text TEXT            Assistant text for local debug frame replay
  --frame-file PATH      Read a raw gateway frame from disk for local debug replay
  --frame-json JSON      Use raw gateway frame JSON text for local debug replay
  --session-id ID        Debug session id override (default: ms_debug_local)
  --user-text TEXT       User utterance text used for backend voice replay
  --live-provider        Use the real Qwen TTS provider in local debug replay
  --env-file PATH        Load provider env vars from a specific env file (default: <repo>/.env.local)
  --provider-timeout-ms N
                        Timeout in ms for live provider audio during local debug replay
  --backend-url URL      Override Oomi backend URL
  --root PATH            Override repo root path for persona discovery
  --role ROLE            Message role override for local debug frame replay
  --omit-role            Omit message.role in the generated local debug frame
  --name NAME            Persona display name (for create)
  --description TEXT     Persona description (for scaffold)
  --slug SLUG            Explicit slug override (for create-managed)
  --summary TEXT         Persona summary (for create)
  --status STATUS        Persona status (for create)
  --type TYPE            Persona type (for create)
  --tags a,b,c           Persona tags (for create)
  --chat-session KEY     Persona chat session key (for create)
  --out PATH             Output directory for scaffolded persona app
  --template-version V   Scaffold template version (default: v1)
  --force                Overwrite files in an existing output directory
  --force-install        Reinstall persona workspace dependencies before launch
  --include-stopped      Relaunch managed persona runtimes even if not currently marked running
  --no-sync              Skip backend sync (for create)
  --no-create            Do not create a managed persona record if one does not already exist
  --local-port N         Local runtime port for persona runtime callbacks
  --endpoint URL         Runtime endpoint for persona runtime callbacks
  --entry-url URL        Viewer URL to register for a launched persona runtime
  --health-path PATH     Runtime health path override (default: workspace-specific)
  --healthcheck-url URL  Runtime healthcheck URL override
  --transport TEXT       Runtime transport label (default: local, relay when --entry-url is used)
  --workspace-root PATH  Persona workspace root (default: OPENCLAW_WORKSPACE/personas)
  --restart              Restart an existing managed persona runtime before launch
  --skip-version-check   Skip checking npm for the latest oomi-ai version during refresh
  --started-at ISO       Start timestamp override
  --observed-at ISO      Heartbeat timestamp override
  --completed-at ISO     Completion timestamp override
  --code TEXT            Error code for fail callbacks
  --message TEXT         Error message for fail callbacks
  --message-file PATH    Structured persona job message JSON file
  --message-json JSON    Structured persona job message JSON text
  --log-file PATH        Runtime log file path override
  --no-install           Skip npm install during persona job execution
  --no-register          Skip persona runtime registration during persona job execution
`);
}

function readFile(filePath) {
  return fs.readFileSync(filePath, 'utf-8');
}

function writeFile(filePath, content, options = undefined) {
  fs.writeFileSync(filePath, content, options);
}

function parseDotEnvLine(line) {
  const trimmed = String(line || '').trim();
  if (!trimmed || trimmed.startsWith('#')) return null;
  const separatorIndex = trimmed.indexOf('=');
  if (separatorIndex <= 0) return null;
  const key = trimmed.slice(0, separatorIndex).trim();
  if (!key) return null;
  let value = trimmed.slice(separatorIndex + 1).trim();
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    value = value.slice(1, -1);
  }
  return { key, value };
}

function loadEnvFile(filePath, keys = []) {
  if (!filePath || !fs.existsSync(filePath)) {
    throw new Error(`Environment file not found: ${filePath}`);
  }
  const selectedKeys = Array.isArray(keys) && keys.length ? new Set(keys) : null;
  const entries = {};
  const lines = readFile(filePath).split(/\r?\n/);
  for (const line of lines) {
    const parsed = parseDotEnvLine(line);
    if (!parsed) continue;
    if (selectedKeys && !selectedKeys.has(parsed.key)) continue;
    entries[parsed.key] = parsed.value;
  }
  return entries;
}

function xmlEscape(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function resolveWorkspace() {
  return resolveOpenclawWorkspaceRoot();
}

function resolveAgentsFile(cliAgentsFile, cliWorkspace) {
  if (cliAgentsFile) return cliAgentsFile;
  const workspace = cliWorkspace || resolveWorkspace();
  return path.join(workspace, 'AGENTS.md');
}

function resolveInstructionsFile() {
  return path.join(PACKAGE_ROOT, 'agent_instructions.md');
}

function installBlock(agentsPath, block) {
  let existing = '';
  if (fs.existsSync(agentsPath)) {
    existing = readFile(agentsPath);
  }

  let content = '';
  if (existing.includes(MARKER_START) && existing.includes(MARKER_END)) {
    const pre = existing.split(MARKER_START)[0];
    const post = existing.split(MARKER_END)[1];
    content = `${pre}${block}${post}`;
  } else {
    const spacer = existing && !existing.endsWith('\n\n') ? '\n\n' : '';
    content = `${existing}${spacer}${block}\n`;
  }

  writeFile(agentsPath, content);
}

function parseArgs(argv) {
  const args = { command: null, subcommand: null, flags: {}, positionals: [] };
  const rest = argv.slice(2);
  if (rest.length > 0) {
    args.command = rest[0];
  }

  let startIndex = 1;
  if (rest.length > 1 && !rest[1].startsWith('--')) {
    args.subcommand = rest[1];
    startIndex = 2;
  }

  for (let i = startIndex; i < rest.length; i += 1) {
    const val = rest[i];
    if (val.startsWith('--')) {
      const key = val.replace(/^--/, '');
      const next = rest[i + 1];
      if (!next || next.startsWith('--')) {
        args.flags[key] = true;
      } else {
        args.flags[key] = next;
        i += 1;
      }
    } else {
      args.positionals.push(val);
    }
  }

  return args;
}

function isTruthyFlag(value) {
  if (value === true) return true;
  if (typeof value !== 'string') return false;
  const normalized = value.trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes';
}

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function findRepoRoot(startDir) {
  let current = startDir;
  for (let i = 0; i < 6; i += 1) {
    const personasDir = path.join(current, 'personas');
    const skillsDir = path.join(current, 'skills', 'oomi');
    if (fs.existsSync(personasDir) || fs.existsSync(skillsDir)) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return null;
}

function resolveRepoRoot(rootFlag) {
  const explicitRoot =
    typeof rootFlag === 'string' && rootFlag.trim()
      ? path.resolve(rootFlag.trim())
      : '';
  const repoRoot = explicitRoot || findRepoRoot(process.cwd()) || findRepoRoot(PACKAGE_ROOT);
  if (!repoRoot) {
    throw new Error('Could not locate repo root. Use --root <repo root>.');
  }
  return repoRoot;
}

function resolveSkillSource(cliRoot) {
  const packaged = path.join(PACKAGE_ROOT, 'skills', 'oomi');
  if (fs.existsSync(packaged)) {
    return packaged;
  }
  const repoRoot = cliRoot || findRepoRoot(process.cwd());
  if (repoRoot) {
    const repoSkill = path.join(repoRoot, 'skills', 'oomi');
    if (fs.existsSync(repoSkill)) {
      return repoSkill;
    }
  }
  return null;
}

function resolveSkillTargets(cliSkillsDir) {
  if (cliSkillsDir) {
    return [cliSkillsDir];
  }

  const envTargets = process.env.OPENCLAW_SKILLS || process.env.OOMI_SKILL_TARGETS;
  if (envTargets) {
    return envTargets.split(',').map((entry) => entry.trim()).filter(Boolean);
  }

  const targets = [];
  const openclaw = resolveOpenclawSkillsDir();
  const clawd = path.join(os.homedir(), 'clawd', 'skills');

  targets.push(openclaw);
  if (fs.existsSync(path.dirname(clawd))) {
    targets.push(clawd);
  }

  return targets;
}

function copyDir(src, dest) {
  if (fs.cpSync) {
    fs.cpSync(src, dest, { recursive: true });
    return;
  }

  ensureDir(dest);
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else if (entry.isFile()) {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

function installInstructions(agentsPath) {
  const instructionsPath = resolveInstructionsFile();
  if (!fs.existsSync(instructionsPath)) {
    throw new Error('Agent instructions file not found in package.');
  }

  const instructions = readFile(instructionsPath).trim();
  const block = `${MARKER_START}\n${instructions}\n${MARKER_END}`;

  const dir = path.dirname(agentsPath);
  ensureDir(dir);
  installBlock(agentsPath, block);
}

function installSkill(skillSource, skillTargets) {
  if (!skillSource) {
    console.warn('Oomi skill source not found. Skipping skill install.');
    return;
  }

  for (const target of skillTargets) {
    const dest = path.join(target, 'oomi');
    ensureDir(target);
    copyDir(skillSource, dest);
    console.log(`Installed Oomi skill into ${dest}`);
  }
}

async function syncPersonas({ backendUrl, root }) {
  const repoRoot = root || findRepoRoot(process.cwd());
  if (!repoRoot) {
    throw new Error('Could not locate repo root (missing personas folder). Use --root PATH.');
  }
  const personasDir = path.join(repoRoot, 'personas');
  if (!fs.existsSync(personasDir)) {
    throw new Error(`No personas directory found at ${personasDir}`);
  }

  const resolvedBackend = backendUrl || process.env.OOMI_BACKEND_URL || process.env.NEXT_PUBLIC_BACKEND_URL;
  if (!resolvedBackend) {
    throw new Error('No backend URL provided. Use --backend-url or set OOMI_BACKEND_URL.');
  }

  const baseUrl = resolvedBackend.replace(/\/$/, '');
  const entries = fs.readdirSync(personasDir, { withFileTypes: true });
  const manifests = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(personasDir, entry.name, 'persona.json'))
    .filter((manifestPath) => fs.existsSync(manifestPath))
    .map((manifestPath) => ({
      path: manifestPath,
      json: JSON.parse(readFile(manifestPath)),
    }));

  for (const manifest of manifests) {
    const response = await fetch(`${baseUrl}/v1/personas`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ persona: manifest.json }),
    });

    if (!response.ok) {
      console.error(`Failed to sync persona ${manifest.json.id || manifest.path} (${response.status})`);
      continue;
    }

    const payload = await response.json();
    console.log(`Synced persona ${payload?.persona?.slug || manifest.json.id || manifest.path}`);
  }
}

function titleCase(input) {
  return input
    .split(/[-_\\s]+/)
    .filter(Boolean)
    .map((word) => word[0].toUpperCase() + word.slice(1))
    .join(' ');
}

async function createPersona({ id, root, flags }) {
  const repoRoot = root || findRepoRoot(process.cwd());
  if (!repoRoot) {
    throw new Error('Could not locate repo root (missing personas folder). Use --root PATH.');
  }

  const personasDir = path.join(repoRoot, 'personas');
  ensureDir(personasDir);

  const personaDir = path.join(personasDir, id);
  if (fs.existsSync(personaDir)) {
    throw new Error(`Persona ${id} already exists at ${personaDir}`);
  }

  ensureDir(personaDir);

  const name = flags.name || titleCase(id);
  const summary = flags.summary || '';
  const status = flags.status || 'inactive';
  const type = flags.type || 'persona';
  const tags = typeof flags.tags === 'string'
    ? flags.tags.split(',').map((tag) => tag.trim()).filter(Boolean)
    : [];
  const chatSessionKey = flags['chat-session'];

  const manifest = {
    id,
    name,
    summary,
    status,
    type,
    tags,
    capabilities: [],
    dataSources: [],
  };

  if (chatSessionKey) {
    manifest.chat = { sessionKey: chatSessionKey };
  }

  const manifestPath = path.join(personaDir, 'persona.json');
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\\n');

  const readmePath = path.join(personaDir, 'README.md');
  fs.writeFileSync(
    readmePath,
    `# ${name}\\n\\n${summary || 'Persona draft.'}\\n`
  );

  console.log(`Created persona ${id} at ${personaDir}`);

  if (flags['no-sync']) {
    return;
  }

  const backendUrl = flags['backend-url'] || process.env.OOMI_BACKEND_URL || process.env.NEXT_PUBLIC_BACKEND_URL;
  if (!backendUrl) {
    console.warn('No backend URL provided. Skipping backend sync.');
    return;
  }

  const baseUrl = backendUrl.replace(/\/$/, '');
  const response = await fetch(`${baseUrl}/v1/personas`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ persona: manifest }),
  });

  if (!response.ok) {
    console.error(`Failed to sync persona ${id} (${response.status})`);
    return;
  }

  const payload = await response.json();
  console.log(`Synced persona ${payload?.persona?.slug || id}`);
}

function printPersonaScaffoldResult(result, asJson = false) {
  if (asJson) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  console.log(`Scaffolded persona app: ${result.slug}`);
  console.log(`Template: ${result.templateId}@${result.templateVersion}`);
  console.log(`Output: ${result.outDir}`);
  console.log(`Health: ${result.healthPath}`);
  console.log(`Start: ${result.startCommand}`);
  if (Array.isArray(result.editableZones) && result.editableZones.length > 0) {
    console.log(`Editable zones: ${result.editableZones.join(', ')}`);
  }
}

function printManagedPersonaCreateResult(result, asJson = false) {
  if (asJson) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  const persona = result?.persona && typeof result.persona === 'object' ? result.persona : {};
  const personaJob = result?.personaJob && typeof result.personaJob === 'object' ? result.personaJob : {};
  console.log(`Managed persona created: ${String(persona.name || persona.slug || 'unknown')}`);
  if (persona.slug) {
    console.log(`Slug: ${persona.slug}`);
  }
  if (persona.lifecycle) {
    console.log(`Lifecycle: ${persona.lifecycle}`);
  }
  if (personaJob.jobId) {
    console.log(`Persona job: ${personaJob.jobId}`);
  }
  if (personaJob.status) {
    console.log(`Job status: ${personaJob.status}`);
  }
  if (personaJob.deviceId) {
    console.log(`Assigned device: ${personaJob.deviceId}`);
  }
}

function parseOptionalPositiveInteger(value) {
  if (value === undefined || value === null || value === '') return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`Expected a positive integer, received: ${value}`);
  }
  return Math.floor(parsed);
}

function resolvePersonaBackendUrl(flags = {}) {
  const bridgeState = readBridgeState();
  const backendUrl = String(
    flags['backend-url'] ||
      process.env.OOMI_DEV_BACKEND_URL ||
      process.env.OOMI_BACKEND_URL ||
      process.env.NEXT_PUBLIC_BACKEND_URL ||
      bridgeState.brokerHttp ||
      ''
  ).trim();
  if (!backendUrl) {
    throw new Error('Missing backend URL. Use --backend-url or pair the device first.');
  }
  return backendUrl.replace(/\/$/, '');
}

function resolvePersonaDeviceToken(flags = {}) {
  const bridgeState = readBridgeState();
  const deviceToken = String(
    flags['device-token'] ||
    bridgeState.deviceToken ||
    ''
  ).trim();
  if (!deviceToken) {
    throw new Error('Missing device token. Use --device-token or pair the device first.');
  }
  return deviceToken;
}

function resolvePersonaDeviceId(flags = {}) {
  const bridgeState = readBridgeState();
  const deviceId = String(
    flags['device-id'] ||
    bridgeState.deviceId ||
    ''
  ).trim();
  if (!deviceId) {
    throw new Error('Missing device id. Use --device-id or pair the device first.');
  }
  return deviceId;
}

function createCliPersonaApiClient(flags = {}) {
  return createPersonaApiClient({
    backendUrl: resolvePersonaBackendUrl(flags),
    deviceToken: resolvePersonaDeviceToken(flags),
    deviceId: resolvePersonaDeviceId(flags),
  });
}

function isHttpErrorStatus(error, status) {
  return Number(error?.status) === Number(status);
}

function resolvePersonaWorkspaceRoot(flags = {}) {
  const workspaceRoot = String(flags['workspace-root'] || defaultPersonaWorkspaceRoot()).trim();
  if (!workspaceRoot) {
    throw new Error('Persona workspace root is required.');
  }
  return workspaceRoot;
}

function resolvePersonaTemplateVersion(flags = {}, fallback = 'v1') {
  return String(flags['template-version'] || fallback || 'v1').trim() || 'v1';
}

function resolvePersonaEntryUrl(flags = {}) {
  return String(flags['entry-url'] || '').trim();
}

function resolvePersonaLaunchTransport(flags = {}) {
  const explicitTransport = String(flags.transport || '').trim();
  if (explicitTransport) {
    return explicitTransport;
  }

  return resolvePersonaEntryUrl(flags) ? 'relay' : 'local';
}

function listPersonaWorkspaceRoots(workspaceRoot = defaultPersonaWorkspaceRoot()) {
  const roots = [
    String(workspaceRoot || '').trim(),
    String(resolveOpenclawLegacyPersonasDir() || '').trim(),
  ].filter(Boolean);

  const deduped = [];
  const seen = new Set();
  for (const root of roots) {
    const resolved = path.resolve(root);
    if (seen.has(resolved) || !fs.existsSync(resolved)) {
      continue;
    }
    seen.add(resolved);
    deduped.push(resolved);
  }

  return deduped;
}

function collectManagedPersonaRefreshTargets({
  workspaceRoot = defaultPersonaWorkspaceRoot(),
  includeStopped = false,
} = {}) {
  const targets = [];
  const seenWorkspacePaths = new Set();
  const seenSlugs = new Set();

  for (const root of listPersonaWorkspaceRoots(workspaceRoot)) {
    const entries = fs.readdirSync(root, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory() && !entry.isSymbolicLink()) {
        continue;
      }

      const workspacePath = path.join(root, entry.name);
      let dedupeKey = workspacePath;
      try {
        dedupeKey = fs.realpathSync(workspacePath);
      } catch {
        dedupeKey = path.resolve(workspacePath);
      }
      if (seenWorkspacePaths.has(dedupeKey)) {
        continue;
      }
      seenWorkspacePaths.add(dedupeKey);

      const state = readPersonaRuntimeState(workspacePath);
      if (!state || Object.keys(state).length === 0) {
        continue;
      }

      const slug = String(state.slug || entry.name || '').trim();
      if (!slug || seenSlugs.has(slug)) {
        continue;
      }

      const pid = normalizePid(state.pid);
      const processRunning = pid ? isPersonaWorkspaceProcessRunning(pid) : false;
      const runtimeStatus = String(state.status || '').trim().toLowerCase();
      if (!includeStopped && !processRunning && runtimeStatus !== 'running') {
        continue;
      }

      seenSlugs.add(slug);
      targets.push({
        slug,
        workspacePath,
        state,
        processRunning,
      });
    }
  }

  return targets.sort((a, b) => a.slug.localeCompare(b.slug));
}

function normalizeBackendPersonaRefreshRecord(rawPersona) {
  if (!rawPersona || typeof rawPersona !== 'object') {
    return null;
  }

  const slug = String(
    rawPersona.slug ||
      rawPersona.id ||
      rawPersona.personaId ||
      ''
  ).trim();
  if (!slug) {
    return null;
  }

  return {
    slug,
    name: String(rawPersona.name || slug).trim() || slug,
    description: String(rawPersona.description || rawPersona.summary || rawPersona.name || slug).trim() || slug,
    templateVersion: String(rawPersona.promptTemplateVersion || 'v1').trim() || 'v1',
    templateType: String(rawPersona.templateType || '').trim(),
  };
}

function resolveExistingWorkspacePathForSlug(slug, workspaceRoot = defaultPersonaWorkspaceRoot()) {
  for (const root of listPersonaWorkspaceRoots(workspaceRoot)) {
    const workspacePath = resolvePersonaWorkspacePath({
      workspaceRoot: root,
      slug,
    });
    if (fs.existsSync(workspacePath)) {
      return workspacePath;
    }
  }
  return '';
}

async function discoverBackendLinkedPersonaRefreshTargets({
  client,
  workspaceRoot = defaultPersonaWorkspaceRoot(),
  existingTargets = [],
  logger = null,
} = {}) {
  if (!client || typeof client.listPersonas !== 'function') {
    return [];
  }

  const targetsBySlug = new Map(
    Array.isArray(existingTargets)
      ? existingTargets.map((target) => [String(target?.slug || '').trim(), target]).filter(([slug]) => slug)
      : [],
  );

  const payload = await client.listPersonas();
  const backendPersonas = Array.isArray(payload?.personas) ? payload.personas : [];
  const discoveredTargets = [];

  for (const rawPersona of backendPersonas) {
    const backendPersona = normalizeBackendPersonaRefreshRecord(rawPersona);
    if (!backendPersona || targetsBySlug.has(backendPersona.slug)) {
      continue;
    }
    const workspacePath = resolveExistingWorkspacePathForSlug(backendPersona.slug, workspaceRoot);
    if (!workspacePath) {
      continue;
    }
    const state = readPersonaRuntimeState(workspacePath);
    const target = {
      slug: backendPersona.slug,
      workspacePath,
      state: {
        ...state,
        slug: backendPersona.slug,
        name: backendPersona.name,
        description: backendPersona.description,
        templateVersion: backendPersona.templateVersion,
      },
      processRunning: false,
    };
    discoveredTargets.push(target);
    targetsBySlug.set(backendPersona.slug, target);
  }

  if (discoveredTargets.length > 0) {
    logger?.(`Added ${discoveredTargets.length} backend-linked persona runtime target${discoveredTargets.length === 1 ? '' : 's'} from workspace discovery.`);
  }

  return discoveredTargets;
}

async function findExistingManagedPersona(client, slug) {
  try {
    return await client.getPersona({ slug });
  } catch (error) {
    if (isHttpErrorStatus(error, 404)) {
      return null;
    }
    throw error;
  }
}

function ensurePersonaJobWorkspace(message, workspaceRoot = defaultPersonaWorkspaceRoot()) {
  const metadata = message && typeof message === 'object' ? message.metadata : null;
  const payload = metadata && typeof metadata === 'object' ? metadata.payload : null;
  if (!payload || typeof payload !== 'object') {
    return message;
  }

  const persona = payload.persona && typeof payload.persona === 'object' ? payload.persona : {};
  const scaffold = payload.scaffold && typeof payload.scaffold === 'object' ? payload.scaffold : {};
  if (!scaffold.outDir && typeof persona.slug === 'string' && persona.slug.trim()) {
    scaffold.outDir = path.join(workspaceRoot, persona.slug.trim());
    payload.scaffold = scaffold;
    metadata.payload = payload;
    message.metadata = metadata;
  }

  return message;
}

async function runLegacyManagedPersonaJobExecution({
  message,
  backendUrl,
  deviceToken,
  deviceId,
  workspaceRoot = defaultPersonaWorkspaceRoot(),
  shouldInstall = true,
  shouldStart = true,
  shouldRegister = true,
  logFilePath = '',
}) {
  const normalizedMessage = ensurePersonaJobWorkspace(
    structuredClone(message),
    workspaceRoot,
  );
  const client = createPersonaApiClient({
    backendUrl,
    deviceToken,
    deviceId,
  });

  return executePersonaJob({
    message: normalizedMessage,
    installWorkspace: shouldInstall
      ? async ({ workspacePath }) => {
          await installPersonaWorkspace({ workspacePath });
        }
      : async () => {},
    startWorkspace: shouldStart
      ? async ({ workspacePath }) =>
          startPersonaWorkspace({
            workspacePath,
            logFilePath,
          })
      : async () => ({ pid: null, logFilePath }),
    waitForRuntime: shouldStart
      ? async ({ runtime }) => {
          await waitForPersonaRuntime({
            healthcheckUrl: runtime.healthcheckUrl,
          });
        }
      : async () => {},
    registerRuntime: shouldRegister
      ? async ({ payload: jobPayload, result: runtimeResult }) => {
          const jobPersona = jobPayload.persona && typeof jobPayload.persona === 'object' ? jobPayload.persona : {};
          await client.registerRuntime({
            slug: String(jobPersona.slug || '').trim(),
            endpoint: runtimeResult.endpoint,
            healthcheckUrl: runtimeResult.healthcheckUrl,
            transport: runtimeResult.transport,
            localPort: runtimeResult.localPort,
            startedAt: new Date().toISOString(),
          });
        }
      : async () => {},
    destroyWorkspace: async ({ payload: jobPayload }) => {
      const jobPersona = jobPayload.persona && typeof jobPayload.persona === 'object' ? jobPayload.persona : {};
      const safeSlug = String(jobPersona.slug || '').trim();
      if (!safeSlug) {
        throw new Error('Destroy persona job payload is missing persona.slug.');
      }

      return destroyManagedPersonaRuntime({
        slug: safeSlug,
        workspaceRoot,
      });
    },
    onJobStart: async ({ jobId }) => {
      await client.startJob({
        jobId,
        startedAt: new Date().toISOString(),
      });
    },
    onJobSuccess: async ({ jobId, result: runtimeResult }) => {
      await client.succeedJob({
        jobId,
        workspacePath: runtimeResult.workspacePath,
        localPort: runtimeResult.localPort,
        transport: runtimeResult.transport,
        endpoint: runtimeResult.endpoint,
        healthcheckUrl: runtimeResult.healthcheckUrl,
        completedAt: new Date().toISOString(),
      });
    },
    onJobFailure: async ({ jobId, error }) => {
      await client.failJob({
        jobId,
        code: String(error?.code || 'PERSONA_JOB_EXECUTION_FAILED').trim(),
        message: String(error?.message || 'Persona job execution failed.').trim(),
        completedAt: new Date().toISOString(),
      });
    },
  });
}

async function runManagedPersonaJobExecution({
  message,
  backendUrl,
  deviceToken,
  deviceId,
  workspaceRoot = defaultPersonaWorkspaceRoot(),
  shouldInstall = true,
  shouldStart = true,
  shouldRegister = true,
  logFilePath = '',
}) {
  if (!shouldStart) {
    return runLegacyManagedPersonaJobExecution({
      message,
      backendUrl,
      deviceToken,
      deviceId,
      workspaceRoot,
      shouldInstall,
      shouldStart,
      shouldRegister,
      logFilePath,
    });
  }

  const normalizedMessage = ensurePersonaJobWorkspace(
    structuredClone(message),
    workspaceRoot,
  );
  const client = createPersonaApiClient({
    backendUrl,
    deviceToken,
    deviceId,
  });
  const payload = extractPersonaJobPayload(normalizedMessage);
  const jobId = String(payload.jobId || normalizedMessage?.metadata?.jobId || '').trim();
  if (!jobId) {
    throw new Error('Persona job payload is missing jobId.');
  }
  if (!['create_persona_runtime', 'destroy_persona_runtime'].includes(payload.jobType)) {
    throw new Error(`Unsupported persona job type: ${payload.jobType || 'unknown'}`);
  }

  const persona = payload.persona && typeof payload.persona === 'object' ? payload.persona : {};
  const slug = String(persona.slug || '').trim();
  const name = String(persona.name || '').trim();
  const description = String(persona.description || '').trim() || name;
  if (!slug || !name) {
    throw new Error('Persona job payload is missing persona slug or name.');
  }

  await client.startJob({
    jobId,
    startedAt: new Date().toISOString(),
  });

  try {
    if (payload.jobType === 'destroy_persona_runtime') {
      const destroyResult = await destroyManagedPersonaRuntime({
        slug,
        workspaceRoot,
      });

      await client.succeedJob({
        jobId,
        workspacePath: destroyResult.workspacePath,
        completedAt: new Date().toISOString(),
      });

      return {
        ok: true,
        jobId,
        result: destroyResult,
      };
    }

    const launchResult = await launchManagedPersonaRuntime({
      slug,
      name,
      description,
      workspaceRoot,
      templateVersion: String(persona.templateVersion || 'v1').trim() || 'v1',
      forceInstall: shouldInstall,
      restart: false,
      logFilePath,
      entryUrl: '',
      transport: 'local',
    });

    let registrationPayload = null;
    if (shouldRegister) {
      registrationPayload = await client.registerRuntime({
        slug,
        endpoint: launchResult.runtime.endpoint,
        healthcheckUrl: launchResult.runtime.healthcheckUrl,
        transport: launchResult.runtime.transport,
        localPort: launchResult.runtime.localPort,
        startedAt: new Date().toISOString(),
      });
    }

    const result = {
      workspacePath: launchResult.workspacePath,
      localPort: launchResult.runtime.localPort,
      transport: launchResult.runtime.transport,
      endpoint: launchResult.runtime.endpoint,
      healthcheckUrl: launchResult.runtime.healthcheckUrl,
      pid: launchResult.state?.pid || null,
      logFilePath: launchResult.state?.logFilePath || '',
      templateVersion: launchResult.state?.templateVersion || String(persona.templateVersion || 'v1').trim() || 'v1',
      reusedRunningProcess: launchResult.reusedRunningProcess,
      scaffolded: launchResult.scaffolded,
      installed: launchResult.installed,
      registration: registrationPayload,
    };

    await client.succeedJob({
      jobId,
      workspacePath: result.workspacePath,
      localPort: result.localPort,
      transport: result.transport,
      endpoint: result.endpoint,
      healthcheckUrl: result.healthcheckUrl,
      completedAt: new Date().toISOString(),
    });

    return {
      ok: true,
      jobId,
      result,
    };
  } catch (error) {
    const messageText = error instanceof Error ? error.message : 'Persona job execution failed.';
    await client.failJob({
      jobId,
      code: 'PERSONA_JOB_EXECUTION_FAILED',
      message: messageText,
      completedAt: new Date().toISOString(),
    });

    return {
      ok: false,
      jobId,
      error: {
        code: 'PERSONA_JOB_EXECUTION_FAILED',
        message: messageText,
      },
    };
  }
}

function resolvePersonaRuntimeWorkspacePath({
  slug = '',
  workspacePath = '',
  workspaceRoot = '',
} = {}) {
  const explicitWorkspacePath = String(workspacePath || '').trim();
  if (explicitWorkspacePath) {
    return path.resolve(explicitWorkspacePath);
  }

  const safeSlug = String(slug || '').trim();
  if (!safeSlug) {
    return '';
  }

  const safeWorkspaceRoot = String(workspaceRoot || defaultPersonaWorkspaceRoot()).trim();
  if (!safeWorkspaceRoot) {
    return '';
  }

  return resolvePersonaWorkspacePath({
    workspaceRoot: safeWorkspaceRoot,
    slug: safeSlug,
  });
}

function resolvePersonaRuntimeInput(flags = {}, defaults = {}, options = {}) {
  const localPort = parseOptionalPositiveInteger(flags['local-port'] || flags.localPort || defaults.localPort);
  const endpoint = String(flags.endpoint || defaults.endpoint || '').trim();
  const explicitHealthPath = String(flags['health-path'] || defaults.healthPath || '').trim();
  const healthcheckUrl = String(flags['healthcheck-url'] || defaults.healthcheckUrl || '').trim();
  const transport = String(flags.transport || defaults.transport || 'local').trim() || 'local';
  const workspacePath = resolvePersonaRuntimeWorkspacePath({
    slug: options.slug || defaults.slug || flags.slug,
    workspacePath:
      options.workspacePath ||
      defaults.workspacePath ||
      flags['workspace-path'] ||
      flags.workspacePath,
    workspaceRoot:
      options.workspaceRoot ||
      defaults.workspaceRoot ||
      flags['workspace-root'] ||
      flags.workspaceRoot,
  });
  const healthPath = explicitHealthPath ||
    resolvePersonaHealthPath({
      workspacePath,
      fallback: '/oomi.health.json',
    });

  if (endpoint) {
    return {
      endpoint,
      healthcheckUrl: healthcheckUrl || `${endpoint.replace(/\/$/, '')}${healthPath}`,
      localPort,
      transport,
    };
  }

  if (!localPort) {
    throw new Error('Runtime endpoint or local port is required.');
  }

  const runtime = buildLocalPersonaRuntime({
    localPort,
    healthPath,
  });

  return {
    ...runtime,
    endpoint: runtime.reachableEndpoint || runtime.endpoint,
    localEndpoint: runtime.endpoint,
  };
}

function parseIsoTimestamp(rawValue, label) {
  const value = String(rawValue || '').trim();
  if (!value) return undefined;
  const timestamp = new Date(value);
  if (Number.isNaN(timestamp.getTime())) {
    throw new Error(`${label} must be a valid ISO timestamp.`);
  }
  return timestamp.toISOString();
}

function readStructuredPersonaJobMessage(flags = {}) {
  const filePath = String(flags['message-file'] || '').trim();
  const inlineJson = String(flags['message-json'] || '').trim();

  if (inlineJson) {
    return JSON.parse(inlineJson);
  }
  if (filePath) {
    return JSON.parse(readFile(path.resolve(filePath)));
  }

  throw new Error('Persona job message is required. Use --message-file or --message-json.');
}

function printStructuredResult(result, asJson = false) {
  if (asJson) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  for (const [key, value] of Object.entries(result)) {
    console.log(`${key}: ${typeof value === 'object' ? JSON.stringify(value) : value}`);
  }
}

async function handlePersonaRuntimeRegisterCommand(slug, flags = {}) {
  const client = createCliPersonaApiClient(flags);
  const jsonOutput = isTruthyFlag(flags.json);
  const runtime = resolvePersonaRuntimeInput(
    flags,
    {},
    {
      slug,
      workspaceRoot: resolvePersonaWorkspaceRoot(flags),
    },
  );
  if (!jsonOutput) {
    console.log(`[personas] Registering runtime for ${slug}.`);
    console.log(`[personas] Backend: ${resolvePersonaBackendUrl(flags)}`);
    console.log(`[personas] Device: ${resolvePersonaDeviceId(flags)}`);
    console.log(`[personas] Endpoint: ${runtime.endpoint}`);
    console.log(`[personas] Healthcheck: ${runtime.healthcheckUrl}`);
  }
  const payload = await client.registerRuntime({
    slug,
    endpoint: runtime.endpoint,
    healthcheckUrl: runtime.healthcheckUrl,
    localPort: runtime.localPort,
    transport: runtime.transport,
    startedAt: parseIsoTimestamp(flags['started-at'], 'started-at'),
  });
  printStructuredResult(payload, jsonOutput);
}

async function handlePersonaHeartbeatCommand(slug, flags = {}) {
  const client = createCliPersonaApiClient(flags);
  const jsonOutput = isTruthyFlag(flags.json);
  const runtime = resolvePersonaRuntimeInput(
    flags,
    {},
    {
      slug,
      workspaceRoot: resolvePersonaWorkspaceRoot(flags),
    },
  );
  if (!jsonOutput) {
    console.log(`[personas] Sending heartbeat for ${slug}.`);
    console.log(`[personas] Backend: ${resolvePersonaBackendUrl(flags)}`);
    console.log(`[personas] Device: ${resolvePersonaDeviceId(flags)}`);
    console.log(`[personas] Endpoint: ${runtime.endpoint}`);
    console.log(`[personas] Healthcheck: ${runtime.healthcheckUrl}`);
  }
  const payload = await client.heartbeatRuntime({
    slug,
    endpoint: runtime.endpoint,
    healthcheckUrl: runtime.healthcheckUrl,
    localPort: runtime.localPort,
    transport: runtime.transport,
    observedAt: parseIsoTimestamp(flags['observed-at'], 'observed-at'),
  });
  printStructuredResult(payload, jsonOutput);
}

async function handlePersonaRuntimeFailCommand(slug, flags = {}) {
  const code = String(flags.code || '').trim();
  const message = String(flags.message || '').trim();
  if (!code) {
    throw new Error('Error code is required. Use --code.');
  }
  if (!message) {
    throw new Error('Error message is required. Use --message.');
  }

  const client = createCliPersonaApiClient(flags);
  const payload = await client.failRuntime({
    slug,
    code,
    message,
  });
  printStructuredResult(payload, isTruthyFlag(flags.json));
}

async function handlePersonaJobStartCommand(jobId, flags = {}) {
  const client = createCliPersonaApiClient(flags);
  const payload = await client.startJob({
    jobId,
    startedAt: parseIsoTimestamp(flags['started-at'], 'started-at'),
  });
  printStructuredResult(payload, isTruthyFlag(flags.json));
}

async function handlePersonaJobSucceedCommand(jobId, flags = {}) {
  const client = createCliPersonaApiClient(flags);
  const workspacePath = String(flags['workspace-path'] || flags.workspacePath || '').trim();
  if (!workspacePath) {
    throw new Error('Workspace path is required. Use --workspace-path.');
  }
  const runtime = resolvePersonaRuntimeInput(
    flags,
    {},
    {
      workspacePath,
    },
  );

  const payload = await client.succeedJob({
    jobId,
    workspacePath,
    localPort: runtime.localPort,
    transport: runtime.transport,
    endpoint: runtime.endpoint,
    healthcheckUrl: runtime.healthcheckUrl,
    completedAt: parseIsoTimestamp(flags['completed-at'], 'completed-at'),
  });
  printStructuredResult(payload, isTruthyFlag(flags.json));
}

async function handlePersonaJobFailCommand(jobId, flags = {}) {
  const code = String(flags.code || '').trim();
  const message = String(flags.message || '').trim();
  if (!code) {
    throw new Error('Error code is required. Use --code.');
  }
  if (!message) {
    throw new Error('Error message is required. Use --message.');
  }

  const client = createCliPersonaApiClient(flags);
  const payload = await client.failJob({
    jobId,
    code,
    message,
    completedAt: parseIsoTimestamp(flags['completed-at'], 'completed-at'),
  });
  printStructuredResult(payload, isTruthyFlag(flags.json));
}

async function handlePersonaJobExecuteCommand(flags = {}) {
  const message = readStructuredPersonaJobMessage(flags);
  const shouldInstall = !isTruthyFlag(flags['no-install']);
  const shouldStart = !isTruthyFlag(flags['no-start']);
  const shouldRegister = !isTruthyFlag(flags['no-register']) && shouldStart;
  const logFilePath = String(flags['log-file'] || '').trim();
  const result = await runManagedPersonaJobExecution({
    message,
    backendUrl: resolvePersonaBackendUrl(flags),
    deviceToken: resolvePersonaDeviceToken(flags),
    deviceId: resolvePersonaDeviceId(flags),
    workspaceRoot: String(flags['workspace-root'] || defaultPersonaWorkspaceRoot()).trim(),
    shouldInstall,
    shouldStart,
    shouldRegister,
    logFilePath,
  });

  printStructuredResult(result, isTruthyFlag(flags.json));
}

async function handlePersonaCreateManagedCommand(flags = {}, positionalSlug = '') {
  const name = String(flags.name || '').trim();
  if (!name) {
    throw new Error('Persona name is required. Usage: oomi personas create-managed [slug] --name "<name>" --description "<description>"');
  }

  const description = String(flags.description || '').trim() || name;
  const explicitSlug = String(flags.slug || positionalSlug || '').trim();
  const client = createCliPersonaApiClient(flags);
  const result = await client.createManagedPersona({
    slug: explicitSlug,
    name,
    description,
    templateType: String(flags['template-type'] || 'persona-app').trim() || 'persona-app',
    promptTemplateVersion: String(flags['template-version'] || 'v1').trim() || 'v1',
  });

  printManagedPersonaCreateResult(result, isTruthyFlag(flags.json));
}

async function handlePersonaLaunchManagedCommand(flags = {}, positionalSlug = '') {
  const client = createCliPersonaApiClient(flags);
  const safeName = String(flags.name || '').trim();
  const safeDescription = String(flags.description || '').trim() || safeName;
  const safeSlug = String(flags.slug || positionalSlug || (safeName ? slugifyPersonaName(safeName) : '')).trim();
  if (!safeSlug) {
    throw new Error('Persona slug or name is required. Usage: oomi personas launch-managed [slug] --name "<name>". Prefer `oomi personas create-managed <slug> --name "<name>" --description "<description>"` first.');
  }

  const shouldCreate = !isTruthyFlag(flags['no-create']);
  let createdPersona = false;
  let personaPayload = await findExistingManagedPersona(client, safeSlug);
  if (!personaPayload) {
    if (!shouldCreate) {
      throw new Error(`Managed persona ${safeSlug} does not exist in Oomi. Remove --no-create or create it first with \`oomi personas create-managed ${safeSlug} --name "<name>" --description "<description>"\`.`);
    }
    if (!safeName) {
      throw new Error('Persona name is required when creating a new managed persona implicitly. Prefer running `oomi personas create-managed <slug> --name "<name>" --description "<description>"` first instead of relying on launch-managed auto-create.');
    }
    personaPayload = await client.createManagedPersona({
      slug: safeSlug,
      name: safeName,
      description: safeDescription,
      templateType: 'persona-app',
      promptTemplateVersion: resolvePersonaTemplateVersion(flags),
    });
    createdPersona = true;
  }

  const persona = personaPayload?.persona && typeof personaPayload.persona === 'object' ? personaPayload.persona : {};
  const launchResult = await launchManagedPersonaRuntime({
    slug: String(persona.slug || safeSlug).trim(),
    name: String(persona.name || safeName || safeSlug).trim(),
    description: String(persona.description || safeDescription || safeName || safeSlug).trim(),
    workspaceRoot: resolvePersonaWorkspaceRoot(flags),
    templateVersion: String(persona.promptTemplateVersion || resolvePersonaTemplateVersion(flags)).trim() || 'v1',
    forceInstall: isTruthyFlag(flags['force-install']),
    restart: isTruthyFlag(flags.restart),
    logFilePath: String(flags['log-file'] || '').trim(),
    entryUrl: resolvePersonaEntryUrl(flags),
    transport: resolvePersonaLaunchTransport(flags),
  });

  let registrationPayload = null;
  if (!isTruthyFlag(flags['no-register'])) {
    registrationPayload = await client.registerRuntime({
      slug: launchResult.slug,
      endpoint: launchResult.runtime.endpoint,
      healthcheckUrl: launchResult.runtime.healthcheckUrl,
      localPort: launchResult.runtime.localPort,
      transport: launchResult.runtime.transport,
      startedAt: parseIsoTimestamp(flags['started-at'], 'started-at') || new Date().toISOString(),
    });
  }

  printStructuredResult({
    ok: true,
    persona,
    createdPersona,
    launch: {
      slug: launchResult.slug,
      workspacePath: launchResult.workspacePath,
      scaffolded: launchResult.scaffolded,
      installed: launchResult.installed,
      reusedRunningProcess: launchResult.reusedRunningProcess,
    },
    runtime: launchResult.runtime,
    localRuntime: launchResult.localRuntime,
    state: launchResult.state,
    registration: registrationPayload,
  }, isTruthyFlag(flags.json));
}

async function handlePersonaStatusCommand(slug, flags = {}) {
  const result = getManagedPersonaRuntimeStatus({
    slug,
    workspaceRoot: resolvePersonaWorkspaceRoot(flags),
  });
  printStructuredResult(result, isTruthyFlag(flags.json));
}

async function handlePersonaStopCommand(slug, flags = {}) {
  const result = await stopManagedPersonaRuntime({
    slug,
    workspaceRoot: resolvePersonaWorkspaceRoot(flags),
  });
  printStructuredResult(result, isTruthyFlag(flags.json));
}

async function handlePersonaDeleteCommand(slug, flags = {}) {
  const result = await destroyManagedPersonaRuntime({
    slug,
    workspaceRoot: resolvePersonaWorkspaceRoot(flags),
  });
  printStructuredResult(result, isTruthyFlag(flags.json));
}

async function restartManagedPersonaRefreshTargets(flags = {}, options = {}) {
  const workspaceRoot = resolvePersonaWorkspaceRoot(flags);
  const localTargets = collectManagedPersonaRefreshTargets({
    workspaceRoot,
    includeStopped: isTruthyFlag(flags['include-stopped']),
  });
  const targetsBySlug = new Map(localTargets.map((target) => [target.slug, target]));
  const targets = [...localTargets];
  const results = [];
  const logger = options.logger || null;

  let client = null;
  let registrationError = '';
  try {
    client = createCliPersonaApiClient(flags);
  } catch (error) {
    registrationError = error instanceof Error ? error.message : String(error);
    logger?.(`Persona backend registration unavailable: ${registrationError}`);
  }

  if (client) {
    try {
      const backendTargets = await discoverBackendLinkedPersonaRefreshTargets({
        client,
        workspaceRoot,
        existingTargets: targets,
        logger,
      });
      for (const target of backendTargets) {
        targetsBySlug.set(target.slug, target);
        targets.push(target);
      }
    } catch (error) {
      logger?.(`Backend persona discovery failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  logger?.(
    `Discovered ${targets.length} managed persona runtime${targets.length == 1 ? '' : 's'} to refresh.`,
  );

  for (const target of targets) {
    const state = target.state && typeof target.state === 'object' ? target.state : {};
    logger?.(
      `Refreshing persona ${target.slug} (previous port: ${String(state.localPort || 'unknown')}).`,
    );
    const launchResult = await launchManagedPersonaRuntime({
      slug: target.slug,
      name: String(state.name || target.slug).trim() || target.slug,
      description: String(state.description || state.name || target.slug).trim() || target.slug,
      workspaceRoot,
      templateVersion: String(state.templateVersion || 'v1').trim() || 'v1',
      forceInstall: isTruthyFlag(flags['force-install']),
      restart: true,
      logFilePath: String(state.logFilePath || '').trim(),
      entryUrl: '',
      transport: 'local',
    });

    let registration = null;
    if (client) {
      try {
        logger?.(`Re-registering runtime for ${launchResult.slug} at ${launchResult.runtime.endpoint}.`);
        registration = await client.registerRuntime({
          slug: launchResult.slug,
          endpoint: launchResult.runtime.endpoint,
          healthcheckUrl: launchResult.runtime.healthcheckUrl,
          localPort: launchResult.runtime.localPort,
          transport: launchResult.runtime.transport,
          startedAt: new Date().toISOString(),
        });
      } catch (error) {
        registration = {
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        };
        logger?.(`Runtime registration failed for ${launchResult.slug}: ${registration.error}`);
      }
    }

    logger?.(
      `Persona ${launchResult.slug} refreshed on port ${launchResult.runtime.localPort} (${launchResult.runtime.endpoint}).`,
    );

    results.push({
      slug: launchResult.slug,
      workspacePath: launchResult.workspacePath,
      localPort: launchResult.runtime.localPort,
      endpoint: launchResult.runtime.endpoint,
      healthcheckUrl: launchResult.runtime.healthcheckUrl,
      registration,
    });
  }

  return {
    workspaceRoot,
    targets,
    results,
    registrationError,
  };
}

async function refreshBridgeForUpdate(flags = {}, options = {}) {
  const logger = options.logger || null;
  if (process.platform === 'darwin') {
    const launchdStatus = readBridgeLaunchdStatus();
    if (launchdStatus.installed) {
      logger?.(`Restarting launchd-managed bridge ${launchdStatus.target}.`);
      await stopBridgeLaunchdService();
      startBridgeLaunchdService();
      incrementBridgeMetric('bridge_restart_count');
      return {
        restarted: true,
        mode: 'service',
        target: launchdStatus.target,
      };
    }
  }

  const running = findRunningBridgeProcess();
  if (!running) {
    logger?.('No bridge process is currently running; skipping bridge restart.');
    return {
      restarted: false,
      mode: 'process',
    };
  }

  logger?.(`Restarting bridge process ${running.pid}.`);
  const stopResult = await stopBridgeProcesses();
  if (Array.isArray(stopResult.stillAlive) && stopResult.stillAlive.length > 0) {
    throw new Error(`Failed to stop bridge processes: ${stopResult.stillAlive.join(', ')}`);
  }

  const detachedResult = startBridgeDetachedProcess(flags);
  incrementBridgeMetric('bridge_restart_count');
  return {
    restarted: true,
    mode: 'process',
    pid: detachedResult.pid,
    alreadyRunning: Boolean(detachedResult.alreadyRunning),
  };
}

async function handleOpenclawRefreshCommand(flags = {}) {
  const jsonOutput = isTruthyFlag(flags.json);
  const logProgress = jsonOutput ? null : (message) => console.log(`[refresh] ${message}`);
  const currentVersion = currentPackageVersion();
  let latestVersion = '';
  if (!isTruthyFlag(flags['skip-version-check'])) {
    logProgress?.(`Checking npm for the latest oomi-ai version (installed: ${currentVersion || 'unknown'}).`);
    latestVersion = await fetchLatestPublishedVersion('oomi-ai');
    if (latestVersion && compareVersions(currentVersion, latestVersion) < 0) {
      throw new Error(
        `Installed oomi-ai ${currentVersion} is behind npm ${latestVersion}. Update first, then rerun: oomi openclaw refresh`
      );
    }
    if (latestVersion) {
      logProgress?.(`Latest published version is ${latestVersion}.`);
    }
  }

  logProgress?.('Refreshing managed persona runtimes.');
  const personaRefresh = await restartManagedPersonaRefreshTargets(flags, {
    logger: logProgress,
  });
  logProgress?.('Refreshing bridge process.');
  const bridgeRefresh = await refreshBridgeForUpdate(flags, {
    logger: logProgress,
  });
  const payload = {
    ok: true,
    currentVersion,
    latestVersion: latestVersion || currentVersion,
    personas: {
      discovered: personaRefresh.targets.length,
      restarted: personaRefresh.results.length,
      registrationError: personaRefresh.registrationError || null,
      results: personaRefresh.results,
    },
    bridge: bridgeRefresh,
  };

  if (jsonOutput) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  console.log(`Oomi refresh complete (${payload.currentVersion})`);
  console.log(`Personas restarted: ${payload.personas.restarted}/${payload.personas.discovered}`);
  if (payload.personas.registrationError) {
    console.log(`Backend registration skipped: ${payload.personas.registrationError}`);
  }
  payload.personas.results.forEach((result) => {
    console.log(`- ${result.slug}: ${result.endpoint}`);
    if (result.registration && result.registration.ok === false) {
      console.log(`  registration: ${result.registration.error}`);
    }
  });
  if (payload.bridge.restarted) {
    console.log(`Bridge restarted (${payload.bridge.mode}).`);
  } else {
    console.log('Bridge not running; no restart performed.');
  }
}

function resolveOpenclawConfigPath() {
  const candidates = resolveOpenclawConfigCandidates();
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

function readOpenclawGatewayConfig() {
  const configPath = resolveOpenclawConfigPath();
  if (!configPath) {
    const openclawHome = resolveOpenclawHome();
    throw new Error(`OpenClaw config not found (${path.join(openclawHome, 'clawdbot.json')} or ${path.join(openclawHome, 'openclaw.json')}).`);
  }

  const parsed = JSON.parse(readFile(configPath));
  const gateway = parsed.gateway || {};
  const auth = gateway.auth || {};
  const port = gateway.port || 18789;
  const bind = gateway.bind || 'loopback';
  const host = bind === 'all' ? '127.0.0.1' : '127.0.0.1';
  const gatewayUrl = `ws://${host}:${port}`;

  return {
    gatewayUrl,
    token: typeof auth.token === 'string' ? auth.token.trim() : '',
    password: typeof auth.password === 'string' ? auth.password.trim() : '',
    configPath,
  };
}

function resolveBridgeStatePath() {
  return resolveOpenclawBridgeStatePath();
}

function resolveBridgeStatusPath() {
  return resolveOpenclawBridgeStatusPath();
}

function resolveBridgeLockPath() {
  return resolveOpenclawBridgeLockPath();
}

function resolveBridgeLiveLogPath() {
  return resolveOpenclawBridgeLiveLogPath();
}

function resolveBridgeLaunchAgentPlistPath() {
  return path.join(os.homedir(), 'Library', 'LaunchAgents', `${BRIDGE_LAUNCHD_LABEL}.plist`);
}

function defaultDeviceId() {
  const host = os.hostname().toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 24) || 'openclaw';
  return `oomi-${host}-${randomUUID().slice(0, 8)}`;
}

function resolveDeviceId(flags, bridgeState) {
  const explicit = String(flags['device-id'] || process.env.OOMI_MANAGED_DEVICE_ID || '').trim();
  if (explicit) return explicit;
  const existing = String(bridgeState.deviceId || '').trim();
  if (existing) return existing;
  return defaultDeviceId();
}

function readBridgeState() {
  const statePath = resolveBridgeStatePath();
  if (!fs.existsSync(statePath)) return {};
  try {
    return JSON.parse(readFile(statePath));
  } catch {
    return {};
  }
}

function writeBridgeState(nextState) {
  const statePath = resolveBridgeStatePath();
  ensureDir(path.dirname(statePath));
  writeFile(statePath, JSON.stringify(nextState, null, 2) + '\n');
}

function readBridgeStatus() {
  return readJsonSafe(resolveBridgeStatusPath()) || {};
}

function writeBridgeStatus(nextStatus) {
  const statusPath = resolveBridgeStatusPath();
  ensureDir(path.dirname(statusPath));
  writeFile(statusPath, JSON.stringify(nextStatus, null, 2) + '\n');
}

function updateBridgeStatus(partial) {
  const current = readBridgeStatus();
  const next = {
    ...current,
    ...partial,
    updatedAt: new Date().toISOString(),
  };
  writeBridgeStatus(next);
  return next;
}

function resolveBridgeStatusForBrokerOpen({ actionCableMode, deviceSubscribed }) {
  if (!actionCableMode) {
    return 'connected';
  }
  return deviceSubscribed ? 'connected' : 'starting';
}

function classifyBridgeSessionScope(sessionId) {
  const normalized = String(sessionId || '').trim();
  return normalized.startsWith('voice_session_') ? 'voice' : 'default';
}

function resolveBridgeStatusForRuntimeFault({ currentStatus, sessionId }) {
  if (classifyBridgeSessionScope(sessionId) === 'voice') {
    return currentStatus === 'connected' ? 'connected' : currentStatus || 'starting';
  }
  if (currentStatus === 'connected' || currentStatus === 'reconnecting' || currentStatus === 'degraded') {
    return 'degraded';
  }
  return 'error';
}

function runBridgeCallbackSafely(callback, onError) {
  return (...args) => {
    try {
      return callback(...args);
    } catch (err) {
      onError(err instanceof Error ? err : new Error(String(err)));
      return undefined;
    }
  };
}

function createBridgeProcessFaultHandler({ readStatus, onReport, onExit }) {
  return ({ phase, error }) => {
    const normalizedError = error instanceof Error ? error : new Error(String(error || 'unknown process fault'));
    const currentStatus = String(readStatus?.()?.status || '').trim();
    const nextStatus = resolveBridgeStatusForRuntimeFault({ currentStatus, sessionId: '' });

    onReport?.({
      phase,
      status: nextStatus,
      error: normalizedError,
      currentStatus,
      shouldExit: nextStatus === 'error',
    });

    if (nextStatus === 'error') {
      onExit?.(1);
    }
  };
}

function normalizeBridgeMetrics(value) {
  if (!value || typeof value !== 'object') return {};
  const next = {};
  for (const [key, raw] of Object.entries(value)) {
    const parsed = Number(raw);
    next[key] = Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : 0;
  }
  return next;
}

function incrementBridgeMetric(metricKey, amount = 1) {
  const normalizedKey = String(metricKey || '').trim();
  if (!normalizedKey) return;
  const delta = Number(amount);
  if (!Number.isFinite(delta) || delta <= 0) return;

  const current = readBridgeStatus();
  const metrics = normalizeBridgeMetrics(current.metrics);
  metrics[normalizedKey] = (metrics[normalizedKey] || 0) + Math.floor(delta);
  updateBridgeStatus({ metrics });
}

function normalizePid(value) {
  const pid = Number(value);
  if (!Number.isInteger(pid) || pid <= 0) return null;
  return pid;
}

function isPidAlive(pid) {
  const normalized = normalizePid(pid);
  if (!normalized) return false;
  try {
    process.kill(normalized, 0);
    return true;
  } catch {
    return false;
  }
}

function isBridgeWorkerCommand(command) {
  const text = String(command || '').trim().toLowerCase();
  if (!text.includes('openclaw bridge')) return false;
  if (/\bopenclaw\s+bridge\s+(ps|stop|restart|ensure)\b/.test(text)) return false;
  if (/\bopenclaw\s+bridge\s+start\b/.test(text)) return true;
  if (/\bopenclaw\s+bridge(\s+--|$)/.test(text)) return true;
  return false;
}

function isBridgeProcess(pid) {
  const normalized = normalizePid(pid);
  if (!normalized) return false;
  if (!isPidAlive(normalized)) return false;

  try {
    const result = spawnSync('ps', ['-p', String(normalized), '-o', 'command='], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    const command = String(result.stdout || '').trim();
    if (!command) return true;
    return isBridgeWorkerCommand(command);
  } catch {
    return true;
  }
}

function readBridgeLock() {
  return readJsonSafe(resolveBridgeLockPath()) || {};
}

function clearStaleBridgeLock() {
  const lockPath = resolveBridgeLockPath();
  if (!fs.existsSync(lockPath)) return;
  const lock = readBridgeLock();
  const lockPid = normalizePid(lock.pid);
  if (lockPid && isBridgeProcess(lockPid)) return;
  try {
    fs.unlinkSync(lockPath);
  } catch {
    // no-op
  }
}

function findRunningBridgeProcess() {
  clearStaleBridgeLock();

  const lock = readBridgeLock();
  const lockPid = normalizePid(lock.pid);
  if (lockPid && isBridgeProcess(lockPid)) {
    return {
      pid: lockPid,
      source: 'lock',
      deviceId: typeof lock.deviceId === 'string' ? lock.deviceId : '',
    };
  }

  const status = readBridgeStatus();
  const statusPid = normalizePid(status.pid);
  if (statusPid && isBridgeProcess(statusPid)) {
    return {
      pid: statusPid,
      source: 'status',
      deviceId: typeof status.deviceId === 'string' ? status.deviceId : '',
    };
  }

  return null;
}

function acquireBridgeLock(deviceId) {
  const lockPath = resolveBridgeLockPath();
  ensureDir(path.dirname(lockPath));
  const payload = {
    pid: process.pid,
    deviceId,
    acquiredAt: bridgeNowIso(),
  };

  const writeLock = () => writeFile(lockPath, JSON.stringify(payload, null, 2) + '\n', { flag: 'wx' });

  try {
    writeLock();
  } catch (err) {
    const code = err && typeof err === 'object' ? err.code : '';
    if (code !== 'EEXIST') {
      throw err;
    }
    clearStaleBridgeLock();
    const existing = findRunningBridgeProcess();
    if (existing && existing.pid !== process.pid) {
      throw new Error(
        `Bridge already running (pid ${existing.pid})${existing.deviceId ? ` for device ${existing.deviceId}` : ''}.`
      );
    }
    writeLock();
  }

  const release = () => {
    const current = readBridgeLock();
    const currentPid = normalizePid(current.pid);
    if (currentPid && currentPid !== process.pid) return;
    try {
      fs.unlinkSync(lockPath);
    } catch {
      // no-op
    }
  };

  process.once('exit', release);
  return release;
}

async function claimBridgeDeviceToken({ brokerHttp, pairCode, deviceId }) {
  const response = await fetch(`${brokerHttp.replace(/\/$/, '')}/v1/pair/claim`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pairCode, deviceId }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.deviceToken) {
    const message =
      (payload && typeof payload.error === 'string' && payload.error) ||
      `Pair claim failed (${response.status})`;
    throw new Error(message);
  }
  return payload;
}

async function requestManagedPairCode({ appUrl, label }) {
  const baseUrl = appUrl.replace(/\/$/, '');
  const response = await fetch(`${baseUrl}/api/gateway/managed/pair/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ label }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload?.pairCode) {
    const message =
      (payload && typeof payload.error === 'string' && payload.error) ||
      `Managed pair start failed (${response.status})`;
    throw new Error(message);
  }
  return payload;
}

async function requestConnectInviteLink({ backendHttp, appUrl, sessionKey, deviceToken }) {
  const response = await fetch(`${backendHttp.replace(/\/$/, '')}/v1/invite_links/start`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${deviceToken}`,
    },
    body: JSON.stringify({ appUrl, sessionKey }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload?.inviteUrl) {
    const message =
      (payload && typeof payload.error === 'string' && payload.error) ||
      `Invite link start failed (${response.status})`;
    throw new Error(message);
  }
  return payload;
}

async function fetchManagedGatewayConfig({ appUrl }) {
  const baseUrl = appUrl.replace(/\/$/, '');
  const response = await fetch(`${baseUrl}/api/gateway/managed/config`, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload?.brokerHttpUrl || !payload?.brokerDeviceWsUrl) {
    const message =
      (payload && typeof payload.error === 'string' && payload.error) ||
      `Managed config fetch failed (${response.status})`;
    throw new Error(message);
  }
  return payload;
}

function base64UrlEncode(value) {
  return Buffer.from(value)
    .toString('base64')
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/g, '');
}

function normalizeDeviceMetadataForAuth(value) {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  if (!trimmed) return '';
  return trimmed.replace(/[A-Z]/g, (char) => String.fromCharCode(char.charCodeAt(0) + 32));
}

function publicKeyRawBase64UrlFromPem(publicKeyPem) {
  const der = createPublicKey(publicKeyPem).export({ type: 'spki', format: 'der' });
  const raw =
    der.length === ED25519_SPKI_PREFIX.length + 32 &&
    der.subarray(0, ED25519_SPKI_PREFIX.length).equals(ED25519_SPKI_PREFIX)
      ? der.subarray(ED25519_SPKI_PREFIX.length)
      : der;
  return base64UrlEncode(raw);
}

function signDevicePayload(privateKeyPem, payload) {
  const key = createPrivateKey(privateKeyPem);
  return base64UrlEncode(cryptoSign(null, Buffer.from(payload, 'utf8'), key));
}

function buildDeviceAuthPayloadV3({
  deviceId,
  clientId,
  clientMode,
  role,
  scopes,
  signedAtMs,
  token,
  nonce,
  platform,
  deviceFamily,
}) {
  return [
    'v3',
    deviceId,
    clientId,
    clientMode,
    role,
    scopes.join(','),
    String(signedAtMs),
    token || '',
    nonce,
    normalizeDeviceMetadataForAuth(platform),
    normalizeDeviceMetadataForAuth(deviceFamily),
  ].join('|');
}

function loadGatewayDeviceIdentity() {
  if (!fs.existsSync(DEVICE_IDENTITY_PATH)) {
    return null;
  }
  try {
    const parsed = JSON.parse(readFile(DEVICE_IDENTITY_PATH));
    if (
      parsed &&
      parsed.version === 1 &&
      typeof parsed.deviceId === 'string' &&
      typeof parsed.publicKeyPem === 'string' &&
      typeof parsed.privateKeyPem === 'string'
    ) {
      return {
        deviceId: parsed.deviceId.trim(),
        publicKeyPem: parsed.publicKeyPem,
        privateKeyPem: parsed.privateKeyPem,
      };
    }
  } catch {
    // no-op
  }
  return null;
}

function prepareGatewayFrameForLocalGateway(frameText, gatewayAuth, options = {}) {
  const connectNonce = typeof options.connectNonce === 'string' ? options.connectNonce.trim() : '';
  const deviceIdentity = options.deviceIdentity || null;

  try {
    const frame = JSON.parse(frameText);
    if (frame?.type !== 'req') {
      return { frameText, waitForChallenge: false };
    }
    const method = typeof frame.method === 'string' ? frame.method.trim() : '';
    if (!method) {
      return { frameText, waitForChallenge: false };
    }

    if (method !== 'connect') {
      const rawParams = frame.params && typeof frame.params === 'object' ? frame.params : {};
      if (method === 'chat.send') {
        const sanitized = {};
        if (typeof rawParams.sessionKey === 'string' && rawParams.sessionKey.trim()) {
          sanitized.sessionKey = rawParams.sessionKey.trim();
        }
        if (typeof rawParams.message === 'string') {
          sanitized.message = rawParams.message;
        }
        if (typeof rawParams.thinking === 'boolean') {
          sanitized.thinking = rawParams.thinking;
        }
        if (typeof rawParams.deliver === 'string' && rawParams.deliver.trim()) {
          sanitized.deliver = rawParams.deliver.trim();
        }
        if (Array.isArray(rawParams.attachments)) {
          sanitized.attachments = rawParams.attachments;
        }
        if (Number.isFinite(rawParams.timeoutMs) && rawParams.timeoutMs > 0) {
          sanitized.timeoutMs = Math.floor(rawParams.timeoutMs);
        }

        const idempotencyKeyCandidates = [
          rawParams.idempotencyKey,
          rawParams.requestId,
          rawParams.correlationId,
          frame.id,
        ];
        const idempotencyKey = idempotencyKeyCandidates.find((value) => typeof value === 'string' && value.trim());
        if (typeof idempotencyKey === 'string' && idempotencyKey.trim()) {
          sanitized.idempotencyKey = idempotencyKey.trim();
        }

        frame.params = sanitized;
        return { frameText: JSON.stringify(frame), waitForChallenge: false };
      }

      if (method === 'chat.history') {
        const sanitized = {};
        if (typeof rawParams.sessionKey === 'string' && rawParams.sessionKey.trim()) {
          sanitized.sessionKey = rawParams.sessionKey.trim();
        }
        if (Number.isFinite(rawParams.limit) && rawParams.limit > 0) {
          sanitized.limit = Math.floor(rawParams.limit);
        }
        frame.params = sanitized;
        return { frameText: JSON.stringify(frame), waitForChallenge: false };
      }

      return { frameText, waitForChallenge: false };
    }

    const rawParams = frame.params && typeof frame.params === 'object' ? frame.params : {};
    const params = {};

    params.minProtocol = Number.isInteger(rawParams.minProtocol) && rawParams.minProtocol >= 1
      ? rawParams.minProtocol
      : 3;
    params.maxProtocol = Number.isInteger(rawParams.maxProtocol) && rawParams.maxProtocol >= 1
      ? rawParams.maxProtocol
      : 3;

    const clientInput = rawParams.client && typeof rawParams.client === 'object' ? rawParams.client : {};
    const client = {};
    const incomingClientId = typeof clientInput.id === 'string' ? clientInput.id.trim().toLowerCase() : '';
    const incomingClientMode = typeof clientInput.mode === 'string' ? clientInput.mode.trim().toLowerCase() : '';
    const proxiedBrowserClient =
      incomingClientMode === 'webchat' ||
      incomingClientId === 'webchat-ui' ||
      incomingClientId === 'webchat' ||
      incomingClientId === 'clawdbot-control-ui';

    // Frames relayed by this bridge originate from a local Node websocket, not a browser.
    // Keep gateway auth/nonce flow, but normalize browser-mode connects to backend identity
    // so Control UI/webchat Origin checks don't reject proxied sessions.
    client.id = proxiedBrowserClient
      ? 'node-host'
      : (typeof clientInput.id === 'string' && clientInput.id.trim() ? clientInput.id.trim() : 'node-host');
    client.version = typeof clientInput.version === 'string' && clientInput.version.trim() ? clientInput.version.trim() : '0.1.0';
    client.platform = proxiedBrowserClient
      ? process.platform
      : (typeof clientInput.platform === 'string' && clientInput.platform.trim() ? clientInput.platform.trim() : process.platform);
    client.mode = proxiedBrowserClient
      ? 'backend'
      : (typeof clientInput.mode === 'string' && clientInput.mode.trim() ? clientInput.mode.trim() : 'backend');
    if (typeof clientInput.displayName === 'string' && clientInput.displayName.trim()) {
      client.displayName = clientInput.displayName.trim();
    }
    if (typeof clientInput.deviceFamily === 'string' && clientInput.deviceFamily.trim()) {
      client.deviceFamily = clientInput.deviceFamily.trim();
    }
    if (typeof clientInput.modelIdentifier === 'string' && clientInput.modelIdentifier.trim()) {
      client.modelIdentifier = clientInput.modelIdentifier.trim();
    }
    if (typeof clientInput.instanceId === 'string' && clientInput.instanceId.trim()) {
      client.instanceId = clientInput.instanceId.trim();
    }
    params.client = client;

    params.role = typeof rawParams.role === 'string' && rawParams.role.trim() ? rawParams.role.trim() : 'operator';

    const existingScopes = Array.isArray(rawParams.scopes)
      ? rawParams.scopes.filter((value) => typeof value === 'string' && value.trim())
      : [];
    const requiredScopes = ['operator.read', 'operator.write'];
    for (const scope of requiredScopes) {
      if (!existingScopes.includes(scope)) {
        existingScopes.push(scope);
      }
    }
    params.scopes = existingScopes;

    params.caps = Array.isArray(rawParams.caps)
      ? rawParams.caps.filter((value) => typeof value === 'string' && value.trim())
      : [];

    params.commands = Array.isArray(rawParams.commands)
      ? rawParams.commands.filter((value) => typeof value === 'string' && value.trim())
      : [];

    if (rawParams.permissions && typeof rawParams.permissions === 'object') {
      const permissions = {};
      for (const [key, value] of Object.entries(rawParams.permissions)) {
        const normalizedKey = typeof key === 'string' ? key.trim() : '';
        if (!normalizedKey || typeof value !== 'boolean') continue;
        permissions[normalizedKey] = value;
      }
      if (Object.keys(permissions).length > 0) {
        params.permissions = permissions;
      }
    }

    if (typeof rawParams.pathEnv === 'string') {
      params.pathEnv = rawParams.pathEnv;
    }

    const auth = {};
    if (gatewayAuth.token) {
      auth.token = gatewayAuth.token;
    } else if (gatewayAuth.password) {
      auth.password = gatewayAuth.password;
    }
    if (Object.keys(auth).length > 0) {
      params.auth = auth;
    }

    if (typeof rawParams.locale === 'string' && rawParams.locale.trim()) {
      params.locale = rawParams.locale;
    }
    if (typeof rawParams.userAgent === 'string' && rawParams.userAgent.trim()) {
      params.userAgent = rawParams.userAgent;
    }

    if (deviceIdentity) {
      if (!connectNonce) {
        return { frameText, waitForChallenge: true };
      }
      const signedAtMs = Date.now();
      const tokenForSignature =
        typeof auth.token === 'string' && auth.token.trim()
          ? auth.token.trim()
          : (typeof auth.deviceToken === 'string' && auth.deviceToken.trim() ? auth.deviceToken.trim() : '');
      const nonceForSignature = connectNonce;

      const payload = buildDeviceAuthPayloadV3({
        deviceId: deviceIdentity.deviceId,
        clientId: client.id,
        clientMode: client.mode,
        role: params.role,
        scopes: existingScopes,
        signedAtMs,
        token: tokenForSignature,
        nonce: nonceForSignature,
        platform: client.platform,
        deviceFamily: typeof client.deviceFamily === 'string' ? client.deviceFamily : '',
      });
      const signature = signDevicePayload(deviceIdentity.privateKeyPem, payload);
      params.device = {
        id: deviceIdentity.deviceId,
        publicKey: publicKeyRawBase64UrlFromPem(deviceIdentity.publicKeyPem),
        signature,
        signedAt: signedAtMs,
        nonce: nonceForSignature,
      };
    }

    frame.params = params;
    return { frameText: JSON.stringify(frame), waitForChallenge: false };
  } catch {
    return { frameText, waitForChallenge: false };
  }
}

function parseJsonPayload(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function extractTextFromGatewayMessage(message) {
  if (!message || typeof message !== 'object') return '';

  if (typeof message.content === 'string' && message.content.trim()) {
    return message.content.trim();
  }

  if (!Array.isArray(message.content)) return '';

  return message.content
    .filter((block) => block && typeof block === 'object' && block.type === 'text' && typeof block.text === 'string')
    .map((block) => block.text.trim())
    .filter(Boolean)
    .join(' ');
}

function summarizeVoiceFrameContract(frameText) {
  const frame = parseJsonPayload(frameText);
  if (!frame || typeof frame !== 'object') {
    return { parseable: false };
  }
  const payload = frame.payload && typeof frame.payload === 'object' ? frame.payload : {};
  const message = payload.message && typeof payload.message === 'object' ? payload.message : {};
  const metadata = message.metadata && typeof message.metadata === 'object' ? message.metadata : {};
  const spokenRaw = Object.prototype.hasOwnProperty.call(metadata, 'spoken') ? metadata.spoken : undefined;
  const spokenNormalized = normalizeSpokenMetadata(spokenRaw);
  const text = extractTextFromGatewayMessage(message);
  return {
    parseable: true,
    event: typeof frame.event === 'string' ? frame.event : '',
    state: typeof payload.state === 'string' ? payload.state : '',
    role: typeof message.role === 'string' ? message.role : '',
    contentLength: text.length,
    hasMetadata: Object.keys(metadata).length > 0,
    hasSpokenKey: Object.prototype.hasOwnProperty.call(metadata, 'spoken'),
    spokenRawType: spokenRaw === undefined ? 'missing' : Array.isArray(spokenRaw) ? 'array' : typeof spokenRaw,
    spokenNormalized: Boolean(spokenNormalized),
    spokenSegmentCount: Array.isArray(spokenNormalized?.segments) ? spokenNormalized.segments.length : 0,
  };
}

function ensureAssistantSpokenMetadata(frameText) {
  const frame = parseJsonPayload(frameText);
  if (!frame || typeof frame !== 'object') {
    return { frameText, changed: false, reason: '' };
  }
  if (frame.type !== 'event' || frame.event !== 'chat') {
    return { frameText, changed: false, reason: '' };
  }

  const payload = frame.payload && typeof frame.payload === 'object' ? frame.payload : null;
  if (!payload || payload.state !== 'final') {
    return { frameText, changed: false, reason: '' };
  }

  const message = payload.message && typeof payload.message === 'object' ? payload.message : null;
  if (!message) {
    return { frameText, changed: false, reason: '' };
  }

  const messageRole = typeof message.role === 'string' ? message.role.trim() : '';
  if (messageRole && messageRole !== 'assistant') {
    return { frameText, changed: false, reason: '' };
  }

  const originalMetadata =
    message.metadata && typeof message.metadata === 'object' && !Array.isArray(message.metadata)
      ? message.metadata
      : {};
  const metadata = { ...originalMetadata };
  const normalizedExplicitSpoken = normalizeSpokenMetadata(originalMetadata.spoken);
  const spoken =
    normalizedExplicitSpoken ||
    inferSpokenMetadataFromContent(extractTextFromGatewayMessage(message));
  if (!spoken) {
    return { frameText, changed: false, reason: '' };
  }

  metadata.spoken = spoken;
  const nextFrame = JSON.stringify({
    ...frame,
    payload: {
      ...payload,
      message: {
        ...message,
        metadata,
      },
    },
  });

  return {
    frameText: nextFrame,
    changed: nextFrame !== frameText,
    reason: normalizedExplicitSpoken ? 'normalized' : (messageRole ? 'synthesized' : 'synthesized_missing_role'),
  };
}

function normalizeAssistantGatewayFrame(sessionId, frameText) {
  const scope = classifyBridgeSessionScope(sessionId);
  const summary = summarizeVoiceFrameContract(frameText);
  if (!summary.parseable || summary.event !== 'chat' || summary.state !== 'final') {
    return {
      frameText,
      changed: false,
      reason: '',
      scope,
      summary,
    };
  }

  const normalized = ensureAssistantSpokenMetadata(frameText);
  return {
    ...normalized,
    scope,
    summary,
  };
}

function buildAssistantFinalDebugFrame({ sessionKey, text, role }) {
  const trimmedSessionKey =
    typeof sessionKey === 'string' && sessionKey.trim()
      ? sessionKey.trim()
      : 'agent:main:webchat:channel:oomi';
  const message = {
    content: String(text || ''),
  };
  if (typeof role === 'string' && role.trim()) {
    message.role = role.trim();
  }
  return JSON.stringify({
    type: 'event',
    event: 'chat',
    payload: {
      sessionKey: trimmedSessionKey,
      state: 'final',
      message,
    },
  });
}

function extractSpokenMetadata(frameText) {
  const payload = parseJsonPayload(frameText);
  const message =
    payload &&
    payload.payload &&
    typeof payload.payload === 'object' &&
    payload.payload.message &&
    typeof payload.payload.message === 'object'
      ? payload.payload.message
      : null;
  const metadata =
    message &&
    message.metadata &&
    typeof message.metadata === 'object' &&
    !Array.isArray(message.metadata)
      ? message.metadata
      : {};
  return normalizeSpokenMetadata(metadata.spoken);
}

function runAssistantFinalDebugCheck(options = {}) {
  const sessionId =
    typeof options.sessionId === 'string' && options.sessionId.trim()
      ? options.sessionId.trim()
      : 'ms_debug_local';
  const sessionKey =
    typeof options.sessionKey === 'string' && options.sessionKey.trim()
      ? options.sessionKey.trim()
      : 'agent:main:webchat:channel:oomi';
  const role =
    options.omitRole
      ? ''
      : (typeof options.role === 'string' && options.role.trim() ? options.role.trim() : 'assistant');

  const rawFrameText =
    typeof options.frameText === 'string' && options.frameText.trim()
      ? options.frameText
      : buildAssistantFinalDebugFrame({
          sessionKey,
          text: options.text,
          role,
        });

  const before = summarizeVoiceFrameContract(rawFrameText);
  const normalized = normalizeAssistantGatewayFrame(sessionId, rawFrameText);
  const after = summarizeVoiceFrameContract(normalized.frameText);
  const spoken = extractSpokenMetadata(normalized.frameText);

  return {
    sessionId,
    sessionKey,
    scope: normalized.scope,
    changed: normalized.changed,
    reason: normalized.reason,
    before,
    after,
    spoken,
    frameText: normalized.frameText,
  };
}

function printAssistantFinalDebugResult(result, asJson) {
  if (asJson) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  console.log(`Session id: ${result.sessionId}`);
  console.log(`Session key: ${result.sessionKey}`);
  console.log(`Scope: ${result.scope}`);
  console.log(`Changed: ${result.changed ? 'yes' : 'no'}${result.reason ? ` (${result.reason})` : ''}`);
  console.log(
    `Before: event=${result.before.event || '<none>'} state=${result.before.state || '<none>'} role=${result.before.role || '<none>'} spoken=${result.before.spokenNormalized ? 'yes' : 'no'}`
  );
  console.log(
    `After: event=${result.after.event || '<none>'} state=${result.after.state || '<none>'} role=${result.after.role || '<none>'} spoken=${result.after.spokenNormalized ? 'yes' : 'no'}`
  );
  if (result.spoken) {
    console.log(`Spoken text: ${result.spoken.text}`);
    console.log(`Segments: ${Array.isArray(result.spoken.segments) ? result.spoken.segments.length : 0}`);
    if (typeof result.spoken.instructions === 'string' && result.spoken.instructions.trim()) {
      console.log(`Instructions: ${result.spoken.instructions}`);
    }
  } else {
    console.log('Spoken text: <missing>');
  }
}

function resolveCommandFromPath(commandName) {
  const normalized = String(commandName || '').trim();
  if (!normalized) return '';
  try {
    const probe = spawnSync(process.platform === 'win32' ? 'where' : 'which', [normalized], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    if (probe.status !== 0) return '';
    const firstLine = String(probe.stdout || '')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find(Boolean);
    return firstLine || '';
  } catch {
    return '';
  }
}

function resolveExecutable(candidates = []) {
  for (const candidate of candidates) {
    if (!candidate) continue;
    const value = String(candidate).trim();
    if (!value) continue;
    if (path.isAbsolute(value) && fs.existsSync(value)) {
      return value;
    }
    if (value.includes(path.sep) || value.includes('/')) {
      const resolved = path.resolve(value);
      if (fs.existsSync(resolved)) {
        return resolved;
      }
      continue;
    }
    const fromPath = resolveCommandFromPath(value);
    if (fromPath) {
      return fromPath;
    }
  }
  return '';
}

function resolveBackendRoot(rootFlag) {
  const repoRoot = resolveRepoRoot(rootFlag);
  const backendRoot = path.join(repoRoot, 'apps', 'backend');
  if (!fs.existsSync(backendRoot)) {
    throw new Error(`Could not locate backend app at ${backendRoot}`);
  }
  return backendRoot;
}

function resolveRubyExecutable() {
  const candidates = [
    process.env.OOMI_RUBY_BIN,
    process.env.RUBY,
    process.platform === 'win32' ? 'ruby.exe' : 'ruby',
    process.platform === 'win32' ? 'ruby' : '',
    process.platform === 'win32' ? 'C:\\Ruby33-x64\\bin\\ruby.exe' : '',
  ];
  const executable = resolveExecutable(candidates);
  if (!executable) {
    throw new Error('Ruby executable not found. Set OOMI_RUBY_BIN or install Ruby locally.');
  }
  return executable;
}

function resolveBundleExecutable() {
  const candidates = [
    process.env.OOMI_BUNDLE_BIN,
    process.platform === 'win32' ? 'bundle.bat' : 'bundle',
    'bundle',
    process.platform === 'win32' ? 'C:\\Ruby33-x64\\bin\\bundle.bat' : '',
  ];
  const executable = resolveExecutable(candidates);
  if (!executable) {
    throw new Error('Bundler executable not found. Set OOMI_BUNDLE_BIN or install Bundler locally.');
  }
  return executable;
}

function shellQuote(value) {
  const text = String(value);
  if (process.platform === 'win32') {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return `'${text.replace(/'/g, `'\\''`)}'`;
}

async function runBundledRubyScript({ backendRoot, scriptPath, inputFile, env = undefined }) {
  const rubyExecutable = resolveRubyExecutable();
  const bundleExecutable = resolveBundleExecutable();
  const commandText = process.platform === 'win32'
    ? [bundleExecutable, 'exec', rubyExecutable, scriptPath, '--input-file', inputFile].map(shellQuote).join(' ')
    : '';
  const childEnv = env ? { ...process.env, ...env } : process.env;

  return await new Promise((resolve, reject) => {
    const child = process.platform === 'win32'
      ? spawn(commandText, [], {
          cwd: backendRoot,
          shell: true,
          env: childEnv,
          stdio: ['ignore', 'pipe', 'pipe'],
        })
      : spawn(bundleExecutable, ['exec', rubyExecutable, scriptPath, '--input-file', inputFile], {
          cwd: backendRoot,
          env: childEnv,
          stdio: ['ignore', 'pipe', 'pipe'],
        });

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('error', reject);
    child.on('close', (code) => {
      resolve({ code: Number(code || 0), stdout, stderr });
    });
  });
}

async function runLocalTtsPipelineDebugCheck(options = {}) {
  const assistant = runAssistantFinalDebugCheck(options);
  const repoRoot = resolveRepoRoot(options.root);
  const backendRoot = resolveBackendRoot(options.root);
  const scriptPath = path.join(backendRoot, 'bin', 'voice_tts_replay.rb');
  if (!fs.existsSync(scriptPath)) {
    throw new Error(`Backend replay script not found: ${scriptPath}`);
  }

  const inputPayload = {
    repoRoot,
    sessionId: assistant.sessionId,
    sessionKey: assistant.sessionKey,
    frameText: assistant.frameText,
    userText:
      typeof options.userText === 'string' && options.userText.trim()
        ? options.userText.trim()
        : 'local debug utterance',
    liveProvider: Boolean(options.liveProvider),
    providerTimeoutMs: parsePositiveInteger(options.providerTimeoutMs, 15000),
  };
  let childEnv = undefined;
  let resolvedEnvFile = '';
  if (options.liveProvider) {
    resolvedEnvFile =
      typeof options.envFile === 'string' && options.envFile.trim()
        ? path.resolve(options.envFile.trim())
        : path.join(repoRoot, '.env.local');
    childEnv = loadEnvFile(resolvedEnvFile, DEBUG_PROVIDER_ENV_KEYS);
  }
  const inputFile = path.join(os.tmpdir(), `oomi-voice-replay-${randomUUID()}.json`);
  writeFile(inputFile, JSON.stringify(inputPayload, null, 2) + '\n');

  try {
    const backend = await runBundledRubyScript({ backendRoot, scriptPath, inputFile, env: childEnv });
    const parsed = backend.stdout.trim() ? JSON.parse(backend.stdout) : null;
    return {
      assistant,
      backend: parsed,
      backendExitCode: backend.code,
      backendStderr: backend.stderr.trim(),
      liveProvider: Boolean(options.liveProvider),
      envFile: resolvedEnvFile || null,
    };
  } finally {
    try {
      fs.unlinkSync(inputFile);
    } catch {
      // no-op
    }
  }
}

function printTtsPipelineDebugResult(result, asJson) {
  if (asJson) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  console.log(`Assistant normalization: ${result.assistant.changed ? 'changed' : 'unchanged'}${result.assistant.reason ? ` (${result.assistant.reason})` : ''}`);
  console.log(`Assistant spoken segments: ${Array.isArray(result.assistant.spoken?.segments) ? result.assistant.spoken.segments.length : 0}`);
  if (!result.backend) {
    console.log('Backend replay: <no output>');
    return;
  }
  console.log(`Backend replay success: ${result.backend.success ? 'yes' : 'no'}`);
  console.log(`Managed speech sidecar: ${result.backend.managed?.assistantSpeechFinal?.present ? 'yes' : 'no'}`);
  console.log(`Backend final text: ${result.backend.qwen?.assistantTextFinal || '<missing>'}`);
  console.log(`Backend TTS appends: ${Array.isArray(result.backend.qwen?.ttsAppends) ? result.backend.qwen.ttsAppends.length : 0}`);
  console.log(`Backend TTS commits: ${Number(result.backend.qwen?.commitCount || 0)}`);
  if (result.liveProvider) {
    console.log(`Live provider audio deltas: ${Number(result.backend.qwen?.audioDeltaCount || 0)}`);
    console.log(`Live provider audio bytes (base64): ${Number(result.backend.qwen?.audioDeltaBytes || 0)}`);
    console.log(`Live provider timeout: ${result.backend.qwen?.providerTimedOut ? 'yes' : 'no'}`);
  }
  if (result.backend.qwen?.errorCode) {
    console.log(`Backend error: ${result.backend.qwen.errorCode}`);
  }
  if (result.backendStderr) {
    console.log(`Backend stderr: ${result.backendStderr}`);
  }
}

async function runPersonaRuntimeDebugCheck(options = {}) {
  const generatedWorkspaceRoot = !(
    typeof options.workspaceRoot === 'string' && options.workspaceRoot.trim()
  );
  const workspaceRoot = generatedWorkspaceRoot
    ? path.join(os.tmpdir(), `oomi-openclaw-dev-${randomUUID()}`, 'personas')
    : path.resolve(String(options.workspaceRoot).trim());
  const safeName =
    typeof options.name === 'string' && options.name.trim()
      ? options.name.trim()
      : 'Persona Dev Smoke';
  const safeDescription =
    typeof options.description === 'string' && options.description.trim()
      ? options.description.trim()
      : 'Local OpenClaw persona runtime smoke test.';
  const safeSlug =
    typeof options.slug === 'string' && options.slug.trim()
      ? options.slug.trim()
      : slugifyPersonaName(safeName);
  const leaveRunning = Boolean(options.leaveRunning);
  const cleanup = Boolean(options.cleanup);

  const launch = await launchManagedPersonaRuntime({
    slug: safeSlug,
    name: safeName,
    description: safeDescription,
    workspaceRoot,
    forceInstall: Boolean(options.forceInstall),
    restart: Boolean(options.restart),
    entryUrl: '',
    transport: 'local',
  });
  const statusAfterLaunch = getManagedPersonaRuntimeStatus({
    slug: safeSlug,
    workspaceRoot,
  });

  let stop = null;
  let statusAfterStop = null;
  if (!leaveRunning) {
    stop = await stopManagedPersonaRuntime({
      slug: safeSlug,
      workspaceRoot,
    });
    statusAfterStop = getManagedPersonaRuntimeStatus({
      slug: safeSlug,
      workspaceRoot,
    });
  }

  let cleanedUp = false;
  if (cleanup && !leaveRunning && generatedWorkspaceRoot) {
    cleanedUp = await cleanupPersonaRuntimeDebugWorkspace(path.resolve(workspaceRoot, '..'));
  }

  return {
    ok: true,
    workspaceRoot,
    generatedWorkspaceRoot,
    cleanedUp,
    slug: safeSlug,
    name: safeName,
    description: safeDescription,
    launch: {
      slug: launch.slug,
      workspacePath: launch.workspacePath,
      scaffolded: launch.scaffolded,
      installed: launch.installed,
      reusedRunningProcess: launch.reusedRunningProcess,
    },
    runtime: launch.runtime,
    localRuntime: launch.localRuntime,
    state: launch.state,
    statusAfterLaunch,
    stop,
    statusAfterStop,
  };
}

async function cleanupPersonaRuntimeDebugWorkspace(rootPath) {
  const targetPath = path.resolve(rootPath);
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      fs.rmSync(targetPath, { recursive: true, force: true });
      return true;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }
  return false;
}

function printPersonaRuntimeDebugResult(result, asJson) {
  if (asJson) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  console.log(`Persona slug: ${result.slug}`);
  console.log(`Workspace root: ${result.workspaceRoot}`);
  console.log(`Workspace: ${result.launch.workspacePath}`);
  console.log(`Scaffolded: ${result.launch.scaffolded ? 'yes' : 'no'}`);
  console.log(`Installed dependencies: ${result.launch.installed ? 'yes' : 'no'}`);
  console.log(`Reused running process: ${result.launch.reusedRunningProcess ? 'yes' : 'no'}`);
  console.log(`Local endpoint: ${result.localRuntime.endpoint}`);
  console.log(`Local port: ${result.localRuntime.localPort}`);
  console.log(`Healthcheck: ${result.localRuntime.healthcheckUrl}`);
  console.log(`Process running after launch: ${result.statusAfterLaunch.processRunning ? 'yes' : 'no'}`);
  if (result.stop) {
    console.log(`Stopped runtime: ${result.stop.stopped ? 'yes' : 'no'}`);
    console.log(`Process running after stop: ${result.statusAfterStop?.processRunning ? 'yes' : 'no'}`);
  } else {
    console.log('Runtime left running for inspection.');
  }
  if (result.cleanedUp) {
    console.log('Temporary workspace cleaned up.');
  }
}

async function runLocalGatewayAgentDebug(flags) {
  const logger = isTruthyFlag(flags.json)
    ? () => {}
    : (...args) => {
        console.log(...args);
      };

  const server = await startLocalGatewayAgentServer({
    host: flags.host,
    port: flags.port,
    token: flags.token,
    password: flags.password,
    logger,
  });

  const readyPayload = {
    ok: true,
    host: server.host,
    port: server.port,
    url: `ws://${server.host}:${server.port}`,
    tokenConfigured: Boolean(server.token),
    passwordConfigured: Boolean(server.password),
  };

  if (isTruthyFlag(flags.json)) {
    console.log(JSON.stringify(readyPayload, null, 2));
  } else {
    console.log(`Local OpenClaw dev gateway listening on ${readyPayload.url}`);
  }

  let closing = false;
  const shutdown = async () => {
    if (closing) return;
    closing = true;
    await server.close();
    process.exit(0);
  };

  process.once('SIGINT', () => {
    void shutdown();
  });
  process.once('SIGTERM', () => {
    void shutdown();
  });

  await new Promise(() => {});
}

async function handleOpenclawDebugCommand(action, flags) {
  const normalizedAction = String(action || '').trim().toLowerCase();
  if (normalizedAction === 'local-gateway-agent') {
    await runLocalGatewayAgentDebug(flags);
    return;
  }

  if (normalizedAction === 'persona-runtime') {
    const result = await runPersonaRuntimeDebugCheck({
      slug: flags.slug,
      name: flags.name,
      description: flags.description,
      workspaceRoot: flags['workspace-root'] || flags['openclaw-home'],
      forceInstall: isTruthyFlag(flags['force-install']),
      restart: isTruthyFlag(flags.restart),
      leaveRunning: isTruthyFlag(flags['leave-running']),
      cleanup: !isTruthyFlag(flags['no-cleanup']),
    });
    printPersonaRuntimeDebugResult(result, isTruthyFlag(flags.json));
    if (!result.statusAfterLaunch.processRunning) {
      throw new Error('Persona runtime smoke check failed to keep the process running after launch.');
    }
    if (result.stop && result.statusAfterStop?.processRunning) {
      throw new Error('Persona runtime smoke check failed to stop the process cleanly.');
    }
    return;
  }

  const frameFile =
    typeof flags['frame-file'] === 'string' && flags['frame-file'].trim()
      ? path.resolve(flags['frame-file'])
      : '';
  const frameText =
    frameFile
      ? readFile(frameFile)
      : (typeof flags['frame-json'] === 'string' && flags['frame-json'].trim() ? flags['frame-json'] : '');
  const text = typeof flags.text === 'string' ? flags.text : '';

  if (!frameText && !text.trim()) {
    throw new Error(
      'Assistant text or frame input is required. Usage: oomi openclaw debug assistant-final --text "<assistant text>"'
    );
  }

  const debugOptions = {
    sessionId: flags['session-id'],
    sessionKey: flags['session-key'],
    role: flags.role,
    omitRole: isTruthyFlag(flags['omit-role']),
    text,
    frameText,
    root: flags.root,
    userText: flags['user-text'],
    liveProvider: isTruthyFlag(flags['live-provider']),
    envFile: flags['env-file'],
    providerTimeoutMs: flags['provider-timeout-ms'],
  };

  if (normalizedAction === 'assistant-final') {
    const result = runAssistantFinalDebugCheck(debugOptions);
    printAssistantFinalDebugResult(result, isTruthyFlag(flags.json));
    return;
  }

  if (normalizedAction === 'tts-pipeline') {
    const result = await runLocalTtsPipelineDebugCheck(debugOptions);
    printTtsPipelineDebugResult(result, isTruthyFlag(flags.json));
    if (!result.backend?.success) {
      throw new Error(result.backend?.qwen?.errorCode || 'Local backend TTS replay failed.');
    }
    return;
  }

  throw new Error('Unknown debug action: ' + normalizedAction + '. Use: oomi openclaw debug assistant-final|tts-pipeline|local-gateway-agent|persona-runtime');
}

function buildOpenclawProfileFromFlags(flags) {
  const defaultProfilePath = resolveOpenclawProfilePath();
  const defaultOpenclawHome = path.dirname(defaultProfilePath);
  const defaultWorkspaceRoot = String(
    flags['workspace-root'] ||
      flags.workspace ||
      process.env.OPENCLAW_WORKSPACE ||
      resolveOpenclawWorkspaceRoot()
  ).trim();
  const defaultGatewayPort = parsePositiveInteger(
    flags['gateway-port'] || process.env.OPENCLAW_GATEWAY_PORT,
    18789
  );
  const pluginTrustMode =
    String(flags['plugin-trust-mode'] || '').trim() === 'plugins.allow' ||
    isTruthyFlag(flags['strict-plugin-allow'])
      ? 'plugins.allow'
      : 'auto-discovery';

  return buildOomiDevLocalProfile({
    profileId: flags['profile-id'] || flags.id || 'oomi-dev-local',
    label: flags.label || 'Oomi Local Dev',
    workspaceRoot: defaultWorkspaceRoot,
    deviceId: flags['device-id'] || process.env.OOMI_DEV_DEVICE_ID || '',
    gatewayPort: defaultGatewayPort,
    gatewayToken:
      flags['gateway-token'] ||
      process.env.OPENCLAW_GATEWAY_TOKEN ||
      process.env.OOMI_DEV_GATEWAY_TOKEN ||
      'dev-gateway-token',
    backendUrl:
      flags['backend-url'] ||
      process.env.OOMI_DEV_BACKEND_URL ||
      process.env.OOMI_BACKEND_URL ||
      '',
    deviceToken:
      flags['device-token'] ||
      process.env.OOMI_DEV_DEVICE_TOKEN ||
      process.env.OOMI_DEVICE_TOKEN ||
      '',
    defaultSessionKey:
      flags['session-key'] ||
      flags['default-session-key'] ||
      process.env.OOMI_DEV_DEFAULT_SESSION_KEY ||
      process.env.OOMI_DEV_SESSION_KEY ||
      'agent:main:webchat:channel:oomi',
    enableOomiChannel:
      isTruthyFlag(flags['enable-channel']) ||
      (!isTruthyFlag(flags['disable-channel']) &&
        Boolean(
          String(
            flags['device-token'] ||
              process.env.OOMI_DEV_DEVICE_TOKEN ||
              process.env.OOMI_DEVICE_TOKEN ||
              ''
          ).trim()
        )),
    requestTimeoutMs: parsePositiveInteger(flags['request-timeout-ms'], 15000),
    pluginTrustMode,
    modelPreset: flags['model-preset'] || 'openrouter-free',
    modelAuthMode: flags['model-auth-mode'] || 'oomi-managed',
    openclawHome: flags['openclaw-home'] || defaultOpenclawHome,
  });
}

function printOpenclawProfileResult(payload, asJson) {
  if (asJson) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  if (payload.profilePath) {
    console.log(`Profile written: ${payload.profilePath}`);
  }
  if (payload.configPath) {
    console.log(`Config updated: ${payload.configPath}`);
  }
  if (payload.identityPath) {
    console.log(`Identity path: ${payload.identityPath}`);
  }
  if (payload.profile?.profileId) {
    console.log(`Profile id: ${payload.profile.profileId}`);
  }
  if (payload.profile?.preset) {
    console.log(`Preset: ${payload.profile.preset}`);
  }
  if (payload.pluginTrustMode) {
    console.log(`Plugin trust mode: ${payload.pluginTrustMode}`);
  }
  if (typeof payload.oomiChannelEnabled === 'boolean') {
    console.log(`Oomi channel enabled: ${payload.oomiChannelEnabled ? 'yes' : 'no'}`);
  }
  if (typeof payload.identityCreated === 'boolean') {
    console.log(`Device identity created: ${payload.identityCreated ? 'yes' : 'no'}`);
  }
}

async function handleOpenclawProfileCommand(action, flags) {
  const normalizedAction = String(action || '').trim().toLowerCase();
  if (!normalizedAction || normalizedAction === 'help') {
    throw new Error('OpenClaw profile action is required. Use: oomi openclaw profile init|apply');
  }

  const profilePath = path.resolve(
    String(flags.profile || flags['profile-file'] || resolveOpenclawProfilePath()).trim()
  );

  if (normalizedAction === 'init') {
    const profile = buildOpenclawProfileFromFlags(flags);
    writeOpenclawProfile(profilePath, profile);
    printOpenclawProfileResult(
      {
        ok: true,
        profilePath,
        profile,
      },
      isTruthyFlag(flags.json)
    );
    return;
  }

  if (normalizedAction === 'apply') {
    const profile = readOpenclawProfile(profilePath);
    if (!profile) {
      throw new Error(`OpenClaw profile not found or unreadable: ${profilePath}`);
    }
    const openclawHome = path.resolve(String(flags['openclaw-home'] || resolveOpenclawHome()).trim());
    const defaultIdentityPath = path.join(openclawHome, 'identity', 'device.json');
    const applyResult = applyOpenclawProfile({
      profile,
      openclawHome,
      configPath:
        typeof flags['config-path'] === 'string' && flags['config-path'].trim()
          ? path.resolve(flags['config-path'])
          : '',
      identityPath:
        typeof flags['identity-path'] === 'string' && flags['identity-path'].trim()
          ? path.resolve(flags['identity-path'])
          : defaultIdentityPath,
      ensureIdentity: !isTruthyFlag(flags['skip-identity']),
    });
    printOpenclawProfileResult(
      {
        ...applyResult,
        profilePath,
        profile,
      },
      isTruthyFlag(flags.json)
    );
    return;
  }

  throw new Error(`Unknown profile action: ${normalizedAction}. Use: oomi openclaw profile init|apply`);
}

function extractCorrelationId(params) {
  if (!params || typeof params !== 'object') return '';
  if (typeof params.correlationId === 'string' && params.correlationId.trim()) {
    return params.correlationId.trim();
  }
  const metadata = params.metadata;
  if (metadata && typeof metadata === 'object' && typeof metadata.correlationId === 'string' && metadata.correlationId.trim()) {
    return metadata.correlationId.trim();
  }
  return '';
}

function extractGatewayRequestMeta(frameText) {
  const payload = parseJsonPayload(frameText);
  if (!payload || typeof payload !== 'object') return null;
  if (payload.type !== 'req') return null;
  const requestId = typeof payload.id === 'string' ? payload.id.trim() : '';
  const method = typeof payload.method === 'string' ? payload.method.trim() : '';
  if (!requestId || !method) return null;

  const params = payload.params && typeof payload.params === 'object' ? payload.params : {};
  const correlationId = extractCorrelationId(params);
  return { requestId, method, correlationId };
}

function extractGatewayResponseMeta(frameText) {
  const payload = parseJsonPayload(frameText);
  if (!payload || typeof payload !== 'object') return null;
  if (payload.type !== 'res') return null;
  const requestId = typeof payload.id === 'string' ? payload.id.trim() : '';
  if (!requestId) return null;
  return {
    requestId,
    ok: payload.ok === true,
  };
}

function isGatewayRunStartedFrame(frameText) {
  const payload = parseJsonPayload(frameText);
  if (!payload || typeof payload !== 'object') return false;
  if (payload.type !== 'event' || payload.event !== 'agent') return false;
  const body = payload.payload;
  if (!body || typeof body !== 'object') return false;
  if (body.stream !== 'lifecycle') return false;
  return body.data && typeof body.data === 'object' && body.data.phase === 'start';
}

function bridgeNowIso() {
  return new Date().toISOString();
}

function extractErrorCode(err) {
  if (!err || typeof err !== 'object') return '';
  const value = err.code;
  return typeof value === 'string' ? value.trim().toUpperCase() : '';
}

function extractErrorMessage(err) {
  if (!err) return '';
  if (typeof err === 'string') return err.trim();
  if (err instanceof Error) return err.message.trim();
  return String(err).trim();
}

function classifyBridgeFailure({ err, reason = '', code = '', forceClass = '' } = {}) {
  const errorCode = (code || extractErrorCode(err)).toUpperCase();
  const message = [extractErrorMessage(err), String(reason || '').trim()].filter(Boolean).join(' | ');
  const text = `${errorCode} ${message}`.toLowerCase();

  let failureClass = forceClass || 'unknown';
  let retryable = true;
  let hint = 'Check broker URL, network path, and bridge token.';
  let baseDelayMs = BRIDGE_RECONNECT_BASE_MS;

  if (
    errorCode === 'ENOTFOUND' ||
    errorCode === 'EAI_AGAIN' ||
    text.includes('enotfound') ||
    text.includes('name resolution') ||
    text.includes('dns')
  ) {
    failureClass = 'dns_resolution';
    hint = 'Host resolution failed. Verify DNS/network access to the broker host.';
    baseDelayMs = 5000;
  } else if (
    text.includes('unauthorized') ||
    text.includes('forbidden') ||
    text.includes('invalid token') ||
    text.includes('token expired') ||
    text.includes('broker rejected')
  ) {
    failureClass = 'auth_rejected';
    retryable = false;
    hint = 'Bridge token is invalid/expired. Re-run: oomi openclaw pair --app-url <url>.';
    baseDelayMs = BRIDGE_RECONNECT_MAX_MS;
  } else if (
    errorCode === 'ECONNREFUSED' ||
    errorCode === 'ENETUNREACH' ||
    errorCode === 'EHOSTUNREACH' ||
    errorCode === 'ETIMEDOUT' ||
    text.includes('socket hang up') ||
    text.includes('abnormal closure')
  ) {
    failureClass = 'network';
    hint = 'Broker network path is unavailable. Check connectivity/firewall/proxy settings.';
    baseDelayMs = 3000;
  }

  return {
    errorCode: errorCode || 'UNKNOWN',
    message: message || 'unknown bridge error',
    failureClass,
    retryable,
    hint,
    baseDelayMs,
  };
}

function computeReconnectDelayMs(attempt, baseDelayMs) {
  const growth = Math.min(BRIDGE_RECONNECT_MAX_MS, Math.round(baseDelayMs * (2 ** Math.max(0, attempt - 1))));
  const jitter = Math.floor(growth * (Math.random() * 0.25));
  return Math.min(BRIDGE_RECONNECT_MAX_MS, growth + jitter);
}

async function assertTcpReachable(urlValue, timeoutMs = 1500) {
  const url = new URL(urlValue);
  const host = url.hostname || '127.0.0.1';
  const port = Number(url.port || (url.protocol === 'wss:' || url.protocol === 'https:' ? 443 : 80));
  if (!Number.isFinite(port) || port <= 0) {
    throw new Error(`Invalid port in URL: ${urlValue}`);
  }

  await new Promise((resolve, reject) => {
    const socket = net.connect({ host, port });
    let finished = false;
    const done = (fn) => (value) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      socket.destroy();
      fn(value);
    };
    const timer = setTimeout(done(reject), timeoutMs, new Error(`TCP connect timeout (${host}:${port})`));
    socket.once('connect', done(resolve));
    socket.once('error', done(reject));
  });
}

async function runBridgePreflight({ brokerWs, gatewayUrl, gatewayConfigPath }) {
  let brokerUrl;
  try {
    brokerUrl = new URL(brokerWs);
  } catch {
    throw new Error(`Invalid broker WS URL: ${brokerWs}`);
  }
  if (brokerUrl.protocol !== 'ws:' && brokerUrl.protocol !== 'wss:') {
    throw new Error(`Broker WS URL must use ws:// or wss:// (received ${brokerUrl.protocol})`);
  }

  const brokerHost = brokerUrl.hostname;
  if (!brokerHost) {
    throw new Error('Broker WS URL is missing hostname.');
  }
  await dnsLookup(brokerHost);

  let parsedGatewayUrl;
  try {
    parsedGatewayUrl = new URL(gatewayUrl);
  } catch {
    throw new Error(`Invalid local gateway URL (${gatewayUrl}) from ${gatewayConfigPath}`);
  }
  if (parsedGatewayUrl.protocol !== 'ws:') {
    throw new Error(`Local gateway URL must use ws:// (received ${parsedGatewayUrl.protocol})`);
  }
  await assertTcpReachable(parsedGatewayUrl.toString());
}

function buildBridgeDetachArgs(rawFlags = {}) {
  const orderedKeys = [
    'broker-http',
    'broker-ws',
    'pair-code',
    'app-url',
    'device-id',
    'device-token',
  ];
  const args = [process.argv[1], 'openclaw', 'bridge'];

  for (const key of orderedKeys) {
    const value = rawFlags[key];
    if (value === undefined || value === null || value === false) continue;
    if (value === true) {
      args.push(`--${key}`);
      continue;
    }
    const text = String(value).trim();
    if (!text) continue;
    args.push(`--${key}`, text);
  }

  return args;
}

function isServiceManagedBridgeStart(flags = {}) {
  return isTruthyFlag(flags['service-managed']);
}

function startBridgeDetachedProcess(rawFlags = {}) {
  const existing = findRunningBridgeProcess();
  if (existing) {
    return {
      pid: existing.pid,
      alreadyRunning: true,
    };
  }

  const args = buildBridgeDetachArgs(rawFlags);
  const logPath = resolveBridgeLiveLogPath();
  ensureDir(path.dirname(logPath));
  fs.appendFileSync(logPath, `[${new Date().toISOString()}] [bridge-supervisor] starting detached bridge\n`);
  const logFd = fs.openSync(logPath, 'a');
  const child = spawn(process.execPath, args, {
    detached: true,
    stdio: ['ignore', logFd, logFd],
  });
  child.unref();
  try {
    fs.closeSync(logFd);
  } catch {
    // no-op
  }
  return {
    pid: child.pid,
    alreadyRunning: false,
  };
}

function listBridgeProcessPids() {
  const pids = new Set();
  const addPid = (value) => {
    const pid = normalizePid(value);
    if (!pid || pid === process.pid) return;
    if (!isBridgeProcess(pid)) return;
    pids.add(pid);
  };

  const lock = readBridgeLock();
  addPid(lock.pid);

  const status = readBridgeStatus();
  addPid(status.pid);

  try {
    const result = spawnSync('ps', ['-Ao', 'pid=,command='], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    const output = String(result.stdout || '');
    for (const rawLine of output.split('\n')) {
      const line = rawLine.trim();
      if (!line) continue;
      const match = line.match(/^(\d+)\s+(.+)$/);
      if (!match) continue;
      const pid = Number(match[1]);
      const command = String(match[2] || '');
      if (!isBridgeWorkerCommand(command)) continue;
      addPid(pid);
    }
  } catch {
    // best-effort process scan
  }

  return Array.from(pids).sort((a, b) => a - b);
}

async function waitForBridgePidsToExit(pids, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const alive = pids.filter((pid) => isBridgeProcess(pid));
    if (alive.length === 0) return [];
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return pids.filter((pid) => isBridgeProcess(pid));
}

async function stopBridgeProcesses() {
  const targets = listBridgeProcessPids();
  if (targets.length === 0) {
    clearStaleBridgeLock();
    updateBridgeStatus({
      status: 'stopped',
      stopSignal: 'none',
      lastDisconnectAt: bridgeNowIso(),
      pid: null,
    });
    return {
      stopped: [],
      forceKilled: [],
      found: [],
    };
  }

  for (const pid of targets) {
    try {
      process.kill(pid, 'SIGTERM');
    } catch {
      // no-op
    }
  }

  let remaining = await waitForBridgePidsToExit(targets, 2500);
  const forceKilled = [];
  if (remaining.length > 0) {
    for (const pid of remaining) {
      try {
        process.kill(pid, 'SIGKILL');
        forceKilled.push(pid);
      } catch {
        // no-op
      }
    }
    remaining = await waitForBridgePidsToExit(remaining, 1000);
  }

  clearStaleBridgeLock();

  const stopped = targets.filter((pid) => !remaining.includes(pid));
  updateBridgeStatus({
    status: 'stopped',
    stopSignal: forceKilled.length > 0 ? 'SIGKILL' : 'SIGTERM',
    lastDisconnectAt: bridgeNowIso(),
    pid: null,
  });

  return {
    stopped,
    forceKilled,
    found: targets,
    stillAlive: remaining,
  };
}

function assertMacOSLaunchdAvailable() {
  if (process.platform !== 'darwin') {
    throw new Error('Bridge service manager is only supported on macOS (launchd).');
  }
  if (typeof process.getuid !== 'function') {
    throw new Error('Cannot resolve current UID for launchd domain.');
  }
}

function launchctlDomain() {
  assertMacOSLaunchdAvailable();
  return `gui/${String(process.getuid())}`;
}

function launchctlServiceTarget() {
  return `${launchctlDomain()}/${BRIDGE_LAUNCHD_LABEL}`;
}

function runLaunchctl(args, { allowFailure = false } = {}) {
  const result = spawnSync('launchctl', args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const status = Number.isInteger(result.status) ? result.status : 1;
  const stdout = String(result.stdout || '').trim();
  const stderr = String(result.stderr || '').trim();
  if (status !== 0 && !allowFailure) {
    throw new Error(
      `launchctl ${args.join(' ')} failed (${status}): ${stderr || stdout || 'unknown launchctl error'}`
    );
  }
  return { status, stdout, stderr };
}

function buildBridgeLaunchAgentPlist() {
  const scriptPath = (() => {
    try {
      return fs.realpathSync(process.argv[1]);
    } catch {
      return process.argv[1];
    }
  })();
  const programArgs = [process.execPath, scriptPath, 'openclaw', 'bridge', 'start', '--service-managed'];
  const bridgeLogPath = resolveBridgeLiveLogPath();
  const argsXml = programArgs.map((arg) => `<string>${xmlEscape(arg)}</string>`).join('\n      ');
  const openclawHome = resolveOpenclawHome();
  const openclawWorkspace = resolveOpenclawWorkspaceRoot();
  const envVars = {
    OOMI_SKIP_UPDATE_CHECK: '1',
  };
  if (process.env.OPENCLAW_HOME) {
    envVars.OPENCLAW_HOME = openclawHome;
  }
  if (process.env.OPENCLAW_WORKSPACE) {
    envVars.OPENCLAW_WORKSPACE = openclawWorkspace;
  }
  const envXml = Object.entries(envVars)
    .map(([key, value]) => `    <key>${xmlEscape(key)}</key>\n    <string>${xmlEscape(value)}</string>`)
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${xmlEscape(BRIDGE_LAUNCHD_LABEL)}</string>
  <key>ProgramArguments</key>
  <array>
      ${argsXml}
  </array>
  <key>WorkingDirectory</key>
  <string>${xmlEscape(openclawHome)}</string>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>ThrottleInterval</key>
  <integer>5</integer>
  <key>EnvironmentVariables</key>
  <dict>
${envXml}
  </dict>
  <key>StandardOutPath</key>
  <string>${xmlEscape(bridgeLogPath)}</string>
  <key>StandardErrorPath</key>
  <string>${xmlEscape(bridgeLogPath)}</string>
</dict>
</plist>
`;
}

function readBridgeLaunchdStatus() {
  assertMacOSLaunchdAvailable();
  const plistPath = resolveBridgeLaunchAgentPlistPath();
  const target = launchctlServiceTarget();
  const printResult = runLaunchctl(['print', target], { allowFailure: true });
  const loaded = printResult.status === 0;
  const output = [printResult.stdout, printResult.stderr].filter(Boolean).join('\n');
  const pidMatch = output.match(/\bpid\s*=\s*(\d+)/);
  const lastExitMatch = output.match(/\blast exit code\s*=\s*(-?\d+)/i);

  return {
    plistPath,
    target,
    installed: fs.existsSync(plistPath),
    loaded,
    pid: pidMatch ? Number(pidMatch[1]) : null,
    running: Boolean(pidMatch && Number(pidMatch[1]) > 0),
    lastExitCode: lastExitMatch ? Number(lastExitMatch[1]) : null,
    printOutput: output,
  };
}

function startBridgeLaunchdService() {
  assertMacOSLaunchdAvailable();
  const plistPath = resolveBridgeLaunchAgentPlistPath();
  if (!fs.existsSync(plistPath)) {
    throw new Error('Bridge service is not installed. Run: oomi openclaw bridge service install');
  }
  writeFile(plistPath, buildBridgeLaunchAgentPlist());
  const domain = launchctlDomain();
  const target = launchctlServiceTarget();
  runLaunchctl(['bootout', domain, plistPath], { allowFailure: true });
  runLaunchctl(['bootstrap', domain, plistPath]);
  runLaunchctl(['enable', target], { allowFailure: true });
  runLaunchctl(['kickstart', '-k', target], { allowFailure: true });
}

async function stopBridgeLaunchdService() {
  assertMacOSLaunchdAvailable();
  const plistPath = resolveBridgeLaunchAgentPlistPath();
  const domain = launchctlDomain();
  runLaunchctl(['bootout', domain, plistPath], { allowFailure: true });
  return stopBridgeProcesses();
}

async function resolveBridgeRuntimeConfig(flags, bridgeState) {
  const explicitBrokerHttp = String(flags['broker-http'] || '').trim();
  const explicitBrokerWs = String(flags['broker-ws'] || '').trim();
  const appUrl = String(flags['app-url'] || process.env.OOMI_APP_URL || '').trim();

  let brokerHttp = String(explicitBrokerHttp || process.env.OOMI_CHAT_BROKER_HTTP_URL || bridgeState.brokerHttp || '').trim();
  let brokerWs = String(explicitBrokerWs || process.env.OOMI_CHAT_BROKER_DEVICE_WS_URL || bridgeState.brokerWs || '').trim();
  let managedConfigUsed = false;
  let managedConfigError = '';

  if (appUrl && (!explicitBrokerHttp || !explicitBrokerWs)) {
    try {
      const managedConfig = await fetchManagedGatewayConfig({ appUrl });
      managedConfigUsed = true;
      if (!explicitBrokerHttp) {
        brokerHttp = String(managedConfig.brokerHttpUrl || '').trim();
      }
      if (!explicitBrokerWs) {
        brokerWs = String(managedConfig.brokerDeviceWsUrl || '').trim();
      }
    } catch (err) {
      managedConfigError = extractErrorMessage(err);
      if (!brokerWs) {
        throw err;
      }
    }
  }

  return {
    appUrl,
    brokerHttp,
    brokerWs,
    managedConfigUsed,
    managedConfigError,
  };
}

async function startOpenclawBridge(flags) {
  const runningBridge = findRunningBridgeProcess();
  if (runningBridge && runningBridge.pid !== process.pid) {
    throw new Error(
      `Bridge already running (pid ${runningBridge.pid})${runningBridge.deviceId ? ` for device ${runningBridge.deviceId}` : ''}.`
    );
  }

  const bridgeState = readBridgeState();
  const runtimeConfig = await resolveBridgeRuntimeConfig(flags, bridgeState);
  const brokerHttp = runtimeConfig.brokerHttp;
  const brokerWs = runtimeConfig.brokerWs;
  const deviceId = resolveDeviceId(flags, bridgeState);
  const pairCode = String(flags['pair-code'] || '').trim().toUpperCase();
  const explicitDeviceToken = String(flags['device-token'] || '').trim();
  const releaseBridgeLock = acquireBridgeLock(deviceId);
  let deviceToken = explicitDeviceToken;
  if (!deviceToken && String(bridgeState.deviceId || '').trim() === deviceId) {
    deviceToken = String(bridgeState.deviceToken || '').trim();
  }

  if (!brokerWs) {
    throw new Error('Missing broker device websocket URL. Set --broker-ws or OOMI_CHAT_BROKER_DEVICE_WS_URL.');
  }

  if (!deviceToken) {
    if (!brokerHttp || !pairCode) {
      throw new Error(
        'No valid saved device token for this device/broker. Provide --pair-code and --broker-http to claim one.'
      );
    }
    const claimed = await claimBridgeDeviceToken({ brokerHttp, pairCode, deviceId });
    deviceToken = String(claimed.deviceToken || '').trim();
    if (!deviceToken) {
      throw new Error('Broker pair claim did not return deviceToken.');
    }
    writeBridgeState({
      brokerHttp,
      brokerWs,
      deviceId,
      deviceToken,
      claimedAt: new Date().toISOString(),
      expiresAt: claimed.expiresAt || null,
    });
    console.log(`Claimed bridge device token for ${deviceId}.`);
  }

  const gateway = readOpenclawGatewayConfig();
  if (!gateway.token && !gateway.password) {
    throw new Error(`Gateway auth token/password not found in ${gateway.configPath}.`);
  }
  const gatewayDeviceIdentity = loadGatewayDeviceIdentity();
  if (!gatewayDeviceIdentity) {
    console.warn(
      `[bridge] OpenClaw device identity not found at ${DEVICE_IDENTITY_PATH}; device-signed connect may fail on newer gateways.`
    );
  }

  if (runtimeConfig.managedConfigUsed && runtimeConfig.appUrl) {
    console.log(`[bridge] refreshed broker URLs from ${runtimeConfig.appUrl}`);
  } else if (runtimeConfig.managedConfigError) {
    console.warn(
      `[bridge] failed to refresh broker URLs from app URL; using local/state broker config (${runtimeConfig.managedConfigError})`
    );
  }

  try {
    await runBridgePreflight({
      brokerWs,
      gatewayUrl: gateway.gatewayUrl,
      gatewayConfigPath: gateway.configPath,
    });
  } catch (err) {
    const failure = classifyBridgeFailure({ err });
    updateBridgeStatus({
      status: 'error',
      deviceId,
      brokerWs,
      brokerHttp,
      gatewayUrl: gateway.gatewayUrl,
      lastDisconnectAt: bridgeNowIso(),
      lastErrorCode: failure.errorCode,
      lastErrorClass: failure.failureClass,
      lastErrorMessage: failure.message,
      hint: failure.hint,
      consecutiveFailures: 0,
      pid: process.pid,
    });
    throw new Error(`Bridge preflight failed (${failure.failureClass}): ${failure.message}. ${failure.hint}`);
  }

  updateBridgeStatus({
    status: 'starting',
    deviceId,
    brokerWs,
    brokerHttp,
    gatewayUrl: gateway.gatewayUrl,
    lastErrorCode: '',
    lastErrorClass: '',
    lastErrorMessage: '',
    consecutiveFailures: 0,
    pid: process.pid,
    startedAt: bridgeNowIso(),
  });

  console.log(`Starting OpenClaw bridge: device=${deviceId}`);
  console.log(`Local gateway: ${gateway.gatewayUrl}`);
  console.log(`Broker WS: ${brokerWs}`);

  const activeGatewaySockets = new Map();
  const reconnectState = {
    attempt: 0,
    timer: null,
    stopped: false,
    lastFailure: null,
  };
  const personaJobPollEnabled = !isTruthyFlag(process.env.OOMI_DISABLE_PERSONA_JOB_POLL);
  const personaJobPollIntervalMs = parsePositiveInteger(
    process.env.OOMI_PERSONA_JOB_POLL_INTERVAL_MS,
    3000,
  );
  const personaJobIdlePollIntervalMs = parsePositiveInteger(
    process.env.OOMI_PERSONA_JOB_IDLE_POLL_INTERVAL_MS,
    3000,
  );
  const personaWorkspaceRoot = defaultPersonaWorkspaceRoot();
  const brokerPath = (() => {
    try {
      return new URL(brokerWs).pathname || '';
    } catch {
      return '';
    }
  })();
  const actionCableMode = brokerPath.endsWith('/cable');
  const deviceChannelIdentifier = JSON.stringify({ channel: 'DeviceChannel' });
  let deviceChannelSubscribed = false;

  const reportBridgeRuntimeFault = ({ phase, sessionId = '', error }) => {
    const message = error instanceof Error ? error.message : String(error || 'unknown bridge callback error');
    const currentStatus = String(readBridgeStatus().status || '').trim();
    const nextStatus = resolveBridgeStatusForRuntimeFault({ currentStatus, sessionId });
    incrementBridgeMetric('bridge_callback_error_count');
    console.error(
      `[bridge] callback.error phase=${phase}${sessionId ? ` session=${sessionId}` : ''}: ${message}`
    );
    updateBridgeStatus({
      status: nextStatus,
      deviceId,
      brokerWs,
      brokerHttp,
      gatewayUrl: gateway.gatewayUrl,
      lastDisconnectAt: bridgeNowIso(),
      lastErrorCode: 'bridge_callback_error',
      lastErrorClass: 'internal',
      lastErrorMessage: `${phase}: ${message}`,
      hint:
        classifyBridgeSessionScope(sessionId) === 'voice'
          ? 'A voice-session bridge callback failed, but provider health remains available for normal chat.'
          : 'The bridge caught an internal callback error and kept running.',
      pid: process.pid,
    });
  };

  const reportBridgeProcessFault = ({ phase, status, error }) => {
    const message = error instanceof Error ? error.message : String(error || 'unknown bridge process fault');
    incrementBridgeMetric('bridge_process_fault_count');
    console.error(`[bridge] process.error phase=${phase}: ${message}`);
    updateBridgeStatus({
      status,
      deviceId,
      brokerWs,
      brokerHttp,
      gatewayUrl: gateway.gatewayUrl,
      lastDisconnectAt: bridgeNowIso(),
      lastErrorCode: 'bridge_process_fault',
      lastErrorClass: 'internal',
      lastErrorMessage: `${phase}: ${message}`,
      hint:
        status === 'error'
          ? 'The bridge hit a runtime fault before it was fully connected and will restart.'
          : 'The bridge caught a process-level runtime fault and stayed alive in degraded mode.',
      pid: process.pid,
    });
  };

  const handleBridgeProcessFault = createBridgeProcessFaultHandler({
    readStatus: readBridgeStatus,
    onReport: ({ phase, status, error }) => {
      reportBridgeProcessFault({ phase, status, error });
    },
    onExit: (code) => {
      reconnectState.stopped = true;
      if (reconnectState.timer) {
        clearTimeout(reconnectState.timer);
        reconnectState.timer = null;
      }
      personaJobPoller?.stop();
      releaseBridgeLock();
      process.exit(code);
    },
  });

  const uncaughtExceptionHandler = (error) => {
    handleBridgeProcessFault({ phase: 'process.uncaughtException', error });
  };

  const unhandledRejectionHandler = (reason) => {
    handleBridgeProcessFault({ phase: 'process.unhandledRejection', error: reason });
  };

  process.on('uncaughtException', uncaughtExceptionHandler);
  process.on('unhandledRejection', unhandledRejectionHandler);

  const personaBackendUrl =
    deviceToken
      ? resolvePersonaBackendUrl({ 'backend-url': process.env.OOMI_DEV_BACKEND_URL || process.env.OOMI_BACKEND_URL || brokerHttp })
      : '';

  const personaJobPoller =
    personaJobPollEnabled && personaBackendUrl && deviceToken
      ? startPersonaJobPoller({
          backendUrl: personaBackendUrl,
          deviceToken,
          pollIntervalMs: personaJobPollIntervalMs,
          idleIntervalMs: personaJobIdlePollIntervalMs,
          logger: console,
          onMessage: async (message) => {
            const result = await runManagedPersonaJobExecution({
              message,
              backendUrl: personaBackendUrl,
              deviceToken,
              deviceId,
              workspaceRoot: personaWorkspaceRoot,
              shouldInstall: true,
              shouldStart: true,
              shouldRegister: true,
            });

            if (result && result.ok) {
              console.log(
                `[persona-jobs] completed ${result.jobId} on port ${result.result?.localPort || 'unknown'}`
              );
              return;
            }

            if (result) {
              console.warn(
                `[persona-jobs] job ${result.jobId} completed with failure: ${result.error?.message || 'unknown error'}`
              );
            }
          },
        })
      : null;
  const personaRuntimeSupervisor =
    personaBackendUrl && deviceToken
      ? startPersonaRuntimeSupervisor({
          backendUrl: personaBackendUrl,
          deviceToken,
          workspaceRoot: personaWorkspaceRoot,
          intervalMs: 30000,
          logger: console,
          autoRestart: true,
        })
      : null;

  if (personaJobPollEnabled && personaBackendUrl && deviceToken) {
    bridgeDebugLog('[persona-jobs] polling filtered control queue for persona_job messages.');
  } else if (personaJobPollEnabled) {
    console.warn('[persona-jobs] disabled because broker HTTP URL or device token is unavailable.');
  }

  const sendBrokerPayload = (brokerSocket, payload) => {
    if (brokerSocket.readyState !== WebSocket.OPEN) return;
    if (!actionCableMode) {
      brokerSocket.send(JSON.stringify(payload));
      return;
    }
    brokerSocket.send(
      JSON.stringify({
        command: 'message',
        identifier: deviceChannelIdentifier,
        data: JSON.stringify(payload),
      })
    );
  };

  const sendGatewayAck = (brokerSocket, {
    sessionId,
    requestId = '',
    method = '',
    correlationId = '',
    stage = 'unknown',
  }) => {
    if (!sessionId) return;
    if (requestId) {
      const sessionBridge = activeGatewaySockets.get(sessionId);
      if (sessionBridge && sessionBridge.pendingRequests instanceof Map) {
        const pending = sessionBridge.pendingRequests.get(requestId);
        if (pending) {
          pending.lastSuccessfulHop = stage;
          sessionBridge.pendingRequests.set(requestId, pending);
        }
      }
    }
    sendBrokerPayload(brokerSocket, {
      action: 'gateway_ack',
      type: 'gateway.ack',
      sessionId,
      requestId,
      method,
      correlationId,
      stage,
      ts: bridgeNowIso(),
    });
  };

  const sendGatewayErrorResponse = (
    brokerSocket,
    {
      sessionId,
      requestMeta,
      code = 'gateway_error',
      message = 'Gateway request failed',
      lastSuccessfulHop = '',
      retryable = false,
      details = null,
    }
  ) => {
    if (!sessionId || !requestMeta || !requestMeta.requestId) return;
    const errorPayload = {
      code,
      message,
      correlationId: requestMeta.correlationId || '',
    };
    if (lastSuccessfulHop) {
      errorPayload.lastSuccessfulHop = lastSuccessfulHop;
    }
    if (retryable === true) {
      errorPayload.retryable = true;
    }
    if (details && typeof details === 'object') {
      errorPayload.details = details;
    }
    const responseFrame = {
      type: 'res',
      id: requestMeta.requestId,
      ok: false,
      error: errorPayload,
    };
    sendBrokerPayload(brokerSocket, {
      action: 'gateway_frame',
      type: 'gateway.frame',
      sessionId,
      frame: JSON.stringify(responseFrame),
    });
  };

  const classifyGatewayClose = (code, reasonText) => {
    const reasonLower = String(reasonText || '').toLowerCase();
    if (code === 1008 && reasonLower.includes('invalid connect params')) {
      return {
        errorCode: 'gateway_invalid_connect_params',
        retryable: false,
      };
    }
    if (code === 1008) {
      return {
        errorCode: 'gateway_policy_violation',
        retryable: false,
      };
    }
    if (code === 1003 || code === 1002) {
      return {
        errorCode: 'gateway_protocol_error',
        retryable: false,
      };
    }
    if (code === 1006) {
      return {
        errorCode: 'gateway_abnormal_close',
        retryable: true,
      };
    }
    return {
      errorCode: 'gateway_closed',
      retryable: true,
    };
  };

  const clearPendingRequestTimeout = (sessionBridge, requestId) => {
    if (!sessionBridge || !(sessionBridge.pendingRequestTimers instanceof Map)) return;
    const existingTimer = sessionBridge.pendingRequestTimers.get(requestId);
    if (existingTimer) {
      clearTimeout(existingTimer);
      sessionBridge.pendingRequestTimers.delete(requestId);
    }
  };

  const clearAllPendingRequestTimeouts = (sessionBridge) => {
    if (!sessionBridge || !(sessionBridge.pendingRequestTimers instanceof Map)) return;
    for (const timer of sessionBridge.pendingRequestTimers.values()) {
      clearTimeout(timer);
    }
    sessionBridge.pendingRequestTimers.clear();
  };

  const startPendingRequestTimeout = (brokerSocket, sessionId, sessionBridge, requestMeta) => {
    if (!sessionBridge || !requestMeta || !requestMeta.requestId) return;
    if (!(sessionBridge.pendingRequestTimers instanceof Map)) {
      sessionBridge.pendingRequestTimers = new Map();
    }
    clearPendingRequestTimeout(sessionBridge, requestMeta.requestId);
    const timer = setTimeout(() => {
      const pending = sessionBridge.pendingRequests instanceof Map
        ? sessionBridge.pendingRequests.get(requestMeta.requestId)
        : null;
      if (!pending) {
        clearPendingRequestTimeout(sessionBridge, requestMeta.requestId);
        return;
      }

      if (requestMeta.method === 'connect') {
        incrementBridgeMetric('connect_timeout_count');
      } else if (requestMeta.method === 'chat.send') {
        incrementBridgeMetric('chat_send_timeout_count');
      } else {
        incrementBridgeMetric('gateway_request_timeout_count');
      }

      const lastSuccessfulHop = typeof pending.lastSuccessfulHop === 'string' && pending.lastSuccessfulHop
        ? pending.lastSuccessfulHop
        : 'bridge.forwarded';
      sendGatewayAck(brokerSocket, {
        sessionId,
        requestId: pending.requestId,
        method: pending.method,
        correlationId: pending.correlationId,
        stage: 'gateway.timeout',
      });
      sendBrokerPayload(brokerSocket, {
        action: 'log',
        type: 'log',
        sessionId,
        level: 'warn',
        message: `Gateway request timeout (${pending.method} ${pending.requestId}) after ${String(BRIDGE_GATEWAY_REQUEST_TIMEOUT_MS)}ms`,
      });
      sendGatewayErrorResponse(brokerSocket, {
        sessionId,
        requestMeta: pending,
        code: 'gateway_timeout',
        message: `Gateway request timeout (${pending.method}) after ${String(BRIDGE_GATEWAY_REQUEST_TIMEOUT_MS)}ms`,
        lastSuccessfulHop,
        retryable: true,
        details: {
          method: pending.method,
          timeoutMs: BRIDGE_GATEWAY_REQUEST_TIMEOUT_MS,
        },
      });

      if (sessionBridge.pendingRequests instanceof Map) {
        sessionBridge.pendingRequests.delete(pending.requestId);
      }
      clearPendingRequestTimeout(sessionBridge, pending.requestId);
    }, BRIDGE_GATEWAY_REQUEST_TIMEOUT_MS);

    sessionBridge.pendingRequestTimers.set(requestMeta.requestId, timer);
  };

  const parseBrokerEnvelope = (raw) => {
    const payload = parseJsonPayload(raw);
    if (!payload) return null;
    if (!actionCableMode) return payload;

    if (payload.type === 'welcome' || payload.type === 'ping') return null;
    if (payload.type === 'confirm_subscription') return { type: 'device.subscribed' };
    if (payload.type === 'disconnect') {
      return {
        type: 'broker.disconnect',
        reason: String(payload.reason || ''),
      };
    }
    if (payload.type === 'reject_subscription') {
      return {
        type: 'broker.reject_subscription',
      };
    }
    if (payload.message && typeof payload.message === 'object') {
      return payload.message;
    }
    return null;
  };

  const scheduleReconnect = () => {
    if (reconnectState.stopped || reconnectState.timer) return;
    reconnectState.attempt += 1;
    incrementBridgeMetric('bridge_reconnect_scheduled_count');
    const failure =
      reconnectState.lastFailure ||
      classifyBridgeFailure({ reason: 'connection closed without classified error' });
    const delayMs = computeReconnectDelayMs(reconnectState.attempt, failure.baseDelayMs);

    bridgeDebugWarn(
      `[bridge] reconnect scheduled in ${delayMs}ms (attempt ${reconnectState.attempt}, class=${failure.failureClass}, code=${failure.errorCode})`
    );

    updateBridgeStatus({
      status: 'reconnecting',
      deviceId,
      brokerWs,
      brokerHttp,
      gatewayUrl: gateway.gatewayUrl,
      lastDisconnectAt: bridgeNowIso(),
      lastErrorCode: failure.errorCode,
      lastErrorClass: failure.failureClass,
      lastErrorMessage: failure.message,
      hint: failure.hint,
      consecutiveFailures: reconnectState.attempt,
      pid: process.pid,
    });

    reconnectState.timer = setTimeout(() => {
      reconnectState.timer = null;
      connectBroker();
    }, delayMs);
  };

  const connectBroker = () => {
    const wsUrl = new URL(brokerWs);
    wsUrl.searchParams.set('token', deviceToken);

    const brokerSocket = new WebSocket(wsUrl.toString());
    let actionCableHeartbeat = null;

    const clearChallengeTimer = (sessionBridge) => {
      if (sessionBridge && sessionBridge.connectChallengeTimer) {
        clearTimeout(sessionBridge.connectChallengeTimer);
        sessionBridge.connectChallengeTimer = null;
      }
    };

    const queueConnectUntilChallenge = (sessionId, sessionBridge, frame) => {
      if (!sessionBridge || typeof frame !== 'string' || !frame) return;
      if (!Array.isArray(sessionBridge.pendingConnectFrames)) {
        sessionBridge.pendingConnectFrames = [];
      }
      if (sessionBridge.pendingConnectFrames.includes(frame)) {
        return;
      }
      sessionBridge.pendingConnectFrames.push(frame);

      if (sessionBridge.connectChallengeTimer) {
        return;
      }

      sessionBridge.connectChallengeTimer = setTimeout(() => {
        sessionBridge.connectChallengeTimer = null;
        const hasPending = Array.isArray(sessionBridge.pendingConnectFrames)
          ? sessionBridge.pendingConnectFrames.length > 0
          : false;
        if (!hasPending || sessionBridge.connectNonce) {
          return;
        }
        console.error(
          `[bridge] gateway.connect_challenge_timeout ${sessionId} (${String(BRIDGE_CONNECT_CHALLENGE_TIMEOUT_MS)}ms)`
        );
        sendBrokerPayload(brokerSocket, {
          action: 'log',
          type: 'log',
          sessionId,
          level: 'error',
          message: `Gateway challenge timeout (${String(BRIDGE_CONNECT_CHALLENGE_TIMEOUT_MS)}ms) for session ${sessionId}`,
        });
        try {
          sessionBridge.socket?.close(4009, 'connect_challenge_timeout');
        } catch {
          // no-op
        }
      }, BRIDGE_CONNECT_CHALLENGE_TIMEOUT_MS);
    };

    const flushPendingConnectFrames = (sessionId, sessionBridge) => {
      if (!sessionBridge || !sessionBridge.connectNonce) return;
      const pending = Array.isArray(sessionBridge.pendingConnectFrames)
        ? sessionBridge.pendingConnectFrames.splice(0, sessionBridge.pendingConnectFrames.length)
        : [];
      if (pending.length === 0) {
        clearChallengeTimer(sessionBridge);
        return;
      }

      clearChallengeTimer(sessionBridge);
      for (const pendingFrame of pending) {
        const requestMeta = extractGatewayRequestMeta(pendingFrame);
        const prepared = prepareGatewayFrameForLocalGateway(pendingFrame, gateway, {
          connectNonce: sessionBridge.connectNonce,
          deviceIdentity: gatewayDeviceIdentity,
        });
        if (!prepared.frameText || prepared.waitForChallenge) {
          if (requestMeta) {
            const pending = sessionBridge.pendingRequests instanceof Map
              ? sessionBridge.pendingRequests.get(requestMeta.requestId)
              : null;
            const lastSuccessfulHop = pending && typeof pending.lastSuccessfulHop === 'string' && pending.lastSuccessfulHop
              ? pending.lastSuccessfulHop
              : 'bridge.waiting_for_challenge';
            sendGatewayAck(brokerSocket, {
              sessionId,
              requestId: requestMeta.requestId,
              method: requestMeta.method,
              correlationId: requestMeta.correlationId,
              stage: 'bridge.dropped',
            });
            sendGatewayErrorResponse(brokerSocket, {
              sessionId,
              requestMeta,
              code: 'bridge_dropped',
              message: 'Bridge dropped connect request after challenge handling.',
              lastSuccessfulHop,
              retryable: true,
            });
            if (sessionBridge.pendingRequests instanceof Map) {
              sessionBridge.pendingRequests.delete(requestMeta.requestId);
            }
            clearPendingRequestTimeout(sessionBridge, requestMeta.requestId);
          }
          continue;
        }
        const result = forwardFrameToSession(sessionBridge, prepared.frameText);
        if (result === 'queued') {
          bridgeDebugLog(`[bridge] client.frame queued after challenge ${sessionId}`);
          if (requestMeta) {
            startPendingRequestTimeout(brokerSocket, sessionId, sessionBridge, requestMeta);
          }
          if (requestMeta) {
            sendGatewayAck(brokerSocket, {
              sessionId,
              requestId: requestMeta.requestId,
              method: requestMeta.method,
              correlationId: requestMeta.correlationId,
              stage: 'bridge.queued',
            });
          }
        } else if (result === 'dropped') {
          bridgeDebugLog(`[bridge] client.frame dropped after challenge ${sessionId}`);
          incrementBridgeMetric('bridge_drop_count');
          if (requestMeta) {
            const pending = sessionBridge.pendingRequests instanceof Map
              ? sessionBridge.pendingRequests.get(requestMeta.requestId)
              : null;
            const lastSuccessfulHop = pending && typeof pending.lastSuccessfulHop === 'string' && pending.lastSuccessfulHop
              ? pending.lastSuccessfulHop
              : 'bridge.waiting_for_challenge';
            clearPendingRequestTimeout(sessionBridge, requestMeta.requestId);
            if (sessionBridge.pendingRequests instanceof Map) {
              sessionBridge.pendingRequests.delete(requestMeta.requestId);
            }
            sendGatewayErrorResponse(brokerSocket, {
              sessionId,
              requestMeta,
              code: 'bridge_dropped',
              message: 'Bridge dropped request because gateway socket is not open.',
              lastSuccessfulHop,
              retryable: true,
            });
          }
          if (requestMeta) {
            sendGatewayAck(brokerSocket, {
              sessionId,
              requestId: requestMeta.requestId,
              method: requestMeta.method,
              correlationId: requestMeta.correlationId,
              stage: 'bridge.dropped',
            });
          }
        } else {
          bridgeDebugLog(`[bridge] client.frame sent after challenge ${sessionId}`);
          if (requestMeta) {
            startPendingRequestTimeout(brokerSocket, sessionId, sessionBridge, requestMeta);
          }
          if (requestMeta) {
            sendGatewayAck(brokerSocket, {
              sessionId,
              requestId: requestMeta.requestId,
              method: requestMeta.method,
              correlationId: requestMeta.correlationId,
              stage: 'bridge.forwarded',
            });
          }
        }
      }
    };

    const setupGatewaySession = (sessionId, sessionBridge) => {
      if (!sessionBridge || !sessionBridge.socket) return;
      const gatewaySocket = sessionBridge.socket;
      if (typeof sessionBridge.connectNonce !== 'string') {
        sessionBridge.connectNonce = '';
      }
      if (!Array.isArray(sessionBridge.pendingConnectFrames)) {
        sessionBridge.pendingConnectFrames = [];
      }
      if (!(sessionBridge.pendingRequests instanceof Map)) {
        sessionBridge.pendingRequests = new Map();
      }
      if (!(sessionBridge.pendingRequestTimers instanceof Map)) {
        sessionBridge.pendingRequestTimers = new Map();
      }
      if (sessionBridge.connectAccepted !== true) {
        sessionBridge.connectAccepted = false;
      }
      if (!Array.isArray(sessionBridge.waitingForConnect)) {
        sessionBridge.waitingForConnect = [];
      }
      if (typeof sessionBridge.lastChatCorrelationId !== 'string') {
        sessionBridge.lastChatCorrelationId = '';
      }
      let connectTimeout = setTimeout(() => {
        if (gatewaySocket.readyState !== WebSocket.CONNECTING) return;
        console.error(
          `[bridge] gateway.connect_timeout ${sessionId} (${String(BRIDGE_GATEWAY_CONNECT_TIMEOUT_MS)}ms)`
        );
        incrementBridgeMetric('gateway_connect_timeout_count');
        sendBrokerPayload(brokerSocket, {
          action: 'log',
          type: 'log',
          sessionId,
          level: 'error',
          message: `Gateway connect timeout (${String(BRIDGE_GATEWAY_CONNECT_TIMEOUT_MS)}ms) for session ${sessionId}`,
        });
        try {
          gatewaySocket.close(4008, 'gateway_connect_timeout');
        } catch {
          // no-op
        }
      }, BRIDGE_GATEWAY_CONNECT_TIMEOUT_MS);

      gatewaySocket.on('open', () => {
        if (connectTimeout) {
          clearTimeout(connectTimeout);
          connectTimeout = null;
        }
        bridgeDebugLog(`[bridge] gateway.open ${sessionId}`);
        flushSessionQueue(sessionBridge);
      });

      gatewaySocket.on('message', runBridgeCallbackSafely((gatewayRaw) => {
        let frame = typeof gatewayRaw === 'string' ? gatewayRaw : gatewayRaw.toString();
        const spokenNormalized = normalizeAssistantGatewayFrame(sessionId, frame);
        if (spokenNormalized.changed) {
          frame = spokenNormalized.frameText;
          if (spokenNormalized.scope === 'voice') {
            bridgeDebugLog(`[bridge] voice.spoken_metadata.${spokenNormalized.reason} ${sessionId} ${JSON.stringify({
              before: spokenNormalized.summary,
              after: summarizeVoiceFrameContract(frame),
            })}`);
          }
        } else if (spokenNormalized.scope === 'voice' && spokenNormalized.summary.event === 'chat' && spokenNormalized.summary.state === 'final') {
          bridgeDebugLog(`[bridge] voice.chat.final ${sessionId} ${JSON.stringify(spokenNormalized.summary)}`);
        }
        const gatewayPayload = parseJsonPayload(frame);
        if (gatewayPayload?.event === 'connect.challenge') {
          bridgeDebugLog(`[bridge] gateway.connect.challenge ${sessionId}`);
          const nonce =
            gatewayPayload.payload && typeof gatewayPayload.payload.nonce === 'string'
              ? gatewayPayload.payload.nonce.trim()
              : '';
          if (!nonce) {
            console.error(`[bridge] gateway.connect.challenge missing nonce for ${sessionId}`);
            sendBrokerPayload(brokerSocket, {
              action: 'log',
              type: 'log',
              sessionId,
              level: 'error',
              message: `Gateway connect challenge missing nonce for session ${sessionId}`,
            });
            try {
              gatewaySocket.close(1008, 'connect_challenge_missing_nonce');
            } catch {
              // no-op
            }
          } else {
            sessionBridge.connectNonce = nonce;
            flushPendingConnectFrames(sessionId, sessionBridge);
          }
        }

        const responseMeta = extractGatewayResponseMeta(frame);
        if (responseMeta && sessionBridge.pendingRequests instanceof Map) {
          const requestMeta = sessionBridge.pendingRequests.get(responseMeta.requestId);
          if (requestMeta) {
            clearPendingRequestTimeout(sessionBridge, responseMeta.requestId);
            sendGatewayAck(brokerSocket, {
              sessionId,
              requestId: requestMeta.requestId,
              method: requestMeta.method,
              correlationId: requestMeta.correlationId,
              stage: responseMeta.ok ? 'gateway.accepted' : 'gateway.rejected',
            });
            if (requestMeta.method === 'connect' && responseMeta.ok) {
              const releasedFrames = flushWaitingForConnect(sessionBridge);
              for (const released of releasedFrames) {
                const releasedMeta = extractGatewayRequestMeta(released.frameText);
                if (!releasedMeta) continue;

                if (released.result === 'queued') {
                  startPendingRequestTimeout(brokerSocket, sessionId, sessionBridge, releasedMeta);
                  sendGatewayAck(brokerSocket, {
                    sessionId,
                    requestId: releasedMeta.requestId,
                    method: releasedMeta.method,
                    correlationId: releasedMeta.correlationId,
                    stage: 'bridge.queued',
                  });
                } else if (released.result === 'dropped') {
                  const pending = sessionBridge.pendingRequests.get(releasedMeta.requestId);
                  const lastSuccessfulHop =
                    pending && typeof pending.lastSuccessfulHop === 'string' && pending.lastSuccessfulHop
                      ? pending.lastSuccessfulHop
                      : 'bridge.waiting_for_connect';
                  clearPendingRequestTimeout(sessionBridge, releasedMeta.requestId);
                  sessionBridge.pendingRequests.delete(releasedMeta.requestId);
                  sendGatewayErrorResponse(brokerSocket, {
                    sessionId,
                    requestMeta: releasedMeta,
                    code: 'bridge_dropped',
                    message: 'Bridge dropped deferred request because gateway socket is not open.',
                    lastSuccessfulHop,
                    retryable: true,
                  });
                  sendGatewayAck(brokerSocket, {
                    sessionId,
                    requestId: releasedMeta.requestId,
                    method: releasedMeta.method,
                    correlationId: releasedMeta.correlationId,
                    stage: 'bridge.dropped',
                  });
                } else {
                  startPendingRequestTimeout(brokerSocket, sessionId, sessionBridge, releasedMeta);
                  sendGatewayAck(brokerSocket, {
                    sessionId,
                    requestId: releasedMeta.requestId,
                    method: releasedMeta.method,
                    correlationId: releasedMeta.correlationId,
                    stage: 'bridge.forwarded',
                  });
                }
              }
            } else if (requestMeta.method === 'connect' && !responseMeta.ok) {
              const deferredFrames = Array.isArray(sessionBridge.waitingForConnect)
                ? sessionBridge.waitingForConnect.splice(0, sessionBridge.waitingForConnect.length)
                : [];
              for (const deferredFrame of deferredFrames) {
                const deferredMeta = extractGatewayRequestMeta(deferredFrame);
                if (!deferredMeta) continue;
                const pending = sessionBridge.pendingRequests.get(deferredMeta.requestId);
                const lastSuccessfulHop =
                  pending && typeof pending.lastSuccessfulHop === 'string' && pending.lastSuccessfulHop
                    ? pending.lastSuccessfulHop
                    : 'bridge.waiting_for_connect';
                clearPendingRequestTimeout(sessionBridge, deferredMeta.requestId);
                sessionBridge.pendingRequests.delete(deferredMeta.requestId);
                sendGatewayErrorResponse(brokerSocket, {
                  sessionId,
                  requestMeta: deferredMeta,
                  code: 'gateway_connect_failed',
                  message: 'Bridge could not forward request because gateway connect did not complete.',
                  lastSuccessfulHop,
                  retryable: true,
                });
                sendGatewayAck(brokerSocket, {
                  sessionId,
                  requestId: deferredMeta.requestId,
                  method: deferredMeta.method,
                  correlationId: deferredMeta.correlationId,
                  stage: 'gateway.rejected',
                });
              }
            }
            if (!responseMeta.ok) {
              incrementBridgeMetric('gateway_rejected_count');
            }
            sessionBridge.pendingRequests.delete(responseMeta.requestId);
          }
        }

        if (isGatewayRunStartedFrame(frame)) {
          sendGatewayAck(brokerSocket, {
            sessionId,
            method: 'chat.send',
            correlationId: sessionBridge.lastChatCorrelationId || '',
            stage: 'run.started',
          });
        }

        sendBrokerPayload(brokerSocket, { action: 'gateway_frame', type: 'gateway.frame', sessionId, frame });
      }, (error) => {
        reportBridgeRuntimeFault({ phase: 'gateway.message', sessionId, error });
      }));

      gatewaySocket.on('close', runBridgeCallbackSafely((code, reason) => {
        if (connectTimeout) {
          clearTimeout(connectTimeout);
          connectTimeout = null;
        }
        clearChallengeTimer(sessionBridge);
        const reasonText = reason ? reason.toString() : '';
        const closeMeta = classifyGatewayClose(code, reasonText);
        bridgeDebugLog(
          `[bridge] gateway.close ${sessionId} code=${String(code)}${reasonText ? ` reason=${reasonText}` : ''}`
        );
        if (sessionBridge.pendingRequests instanceof Map) {
          for (const requestMeta of sessionBridge.pendingRequests.values()) {
            if (!requestMeta || typeof requestMeta !== 'object') continue;
            const lastSuccessfulHop = typeof requestMeta.lastSuccessfulHop === 'string' && requestMeta.lastSuccessfulHop
              ? requestMeta.lastSuccessfulHop
              : 'bridge.forwarded';
            sendGatewayAck(brokerSocket, {
              sessionId,
              requestId: requestMeta.requestId || '',
              method: requestMeta.method || '',
              correlationId: requestMeta.correlationId || '',
              stage: 'gateway.closed',
            });
            sendGatewayErrorResponse(brokerSocket, {
              sessionId,
              requestMeta,
              code: closeMeta.errorCode,
              message: reasonText
                ? `Gateway closed (${String(code)}): ${reasonText}`
                : `Gateway closed (${String(code)})`,
              lastSuccessfulHop,
              retryable: closeMeta.retryable,
              details: {
                closeCode: code,
                closeReason: reasonText,
              },
            });
          }
          sessionBridge.pendingRequests.clear();
        }
        clearAllPendingRequestTimeouts(sessionBridge);
        activeGatewaySockets.delete(sessionId);
        sendBrokerPayload(brokerSocket, {
          action: 'gateway_closed',
          type: 'gateway.closed',
          sessionId,
          code,
          reason: reasonText,
        });
      }, (error) => {
        reportBridgeRuntimeFault({ phase: 'gateway.close', sessionId, error });
      }));

      gatewaySocket.on('error', runBridgeCallbackSafely((err) => {
        if (connectTimeout && gatewaySocket.readyState !== WebSocket.CONNECTING) {
          clearTimeout(connectTimeout);
          connectTimeout = null;
        }
        console.error(`[bridge] gateway.error ${sessionId}: ${String(err)}`);
        sendBrokerPayload(brokerSocket, {
          action: 'log',
          type: 'log',
          sessionId,
          level: 'error',
          message: `Gateway socket error (${sessionId}): ${String(err)}`,
        });
      }, (error) => {
        reportBridgeRuntimeFault({ phase: 'gateway.error', sessionId, error });
      }));
    };

    const getOrCreateGatewaySession = (sessionId) => {
      const existing = activeGatewaySockets.get(sessionId);
      if (existing) return existing;
      const sessionBridge = ensureSessionBridge({
        sessions: activeGatewaySockets,
        sessionId,
        createSocket: () => new WebSocket(gateway.gatewayUrl),
      });
      if (sessionBridge) setupGatewaySession(sessionId, sessionBridge);
      return sessionBridge;
    };

    brokerSocket.on('open', () => {
      bridgeDebugLog('[bridge] Connected to managed broker.');
      reconnectState.attempt = 0;
      reconnectState.lastFailure = null;
      if (actionCableMode) {
        brokerSocket.send(
          JSON.stringify({
            command: 'subscribe',
            identifier: deviceChannelIdentifier,
          })
        );
        actionCableHeartbeat = setInterval(() => {
          sendBrokerPayload(brokerSocket, { action: 'heartbeat' });
        }, 15000);
      }
      updateBridgeStatus({
        status: resolveBridgeStatusForBrokerOpen({
          actionCableMode,
          deviceSubscribed: deviceChannelSubscribed,
        }),
        deviceId,
        brokerWs,
        brokerHttp,
        gatewayUrl: gateway.gatewayUrl,
        lastConnectedAt: bridgeNowIso(),
        lastErrorCode: '',
        lastErrorClass: '',
        lastErrorMessage: '',
        hint: '',
        consecutiveFailures: 0,
        pid: process.pid,
      });
    });

    brokerSocket.on('message', runBridgeCallbackSafely((rawData) => {
      const text = typeof rawData === 'string' ? rawData : rawData.toString();
      const payload = parseBrokerEnvelope(text);
      if (!payload || typeof payload.type !== 'string') return;

      if (payload.type === 'device.subscribed') {
        deviceChannelSubscribed = true;
        updateBridgeStatus({
          status: 'connected',
          deviceId,
          brokerWs,
          brokerHttp,
          gatewayUrl: gateway.gatewayUrl,
          lastConnectedAt: bridgeNowIso(),
          lastErrorCode: '',
          lastErrorClass: '',
          lastErrorMessage: '',
          hint: '',
          consecutiveFailures: 0,
          pid: process.pid,
        });
        return;
      }

      if (payload.type === 'broker.disconnect') {
        reconnectState.lastFailure = classifyBridgeFailure({
          reason: String(payload.reason || 'unauthorized'),
          forceClass: 'auth_rejected',
        });
        reconnectState.stopped = true;
        console.error(`[bridge] Broker rejected connection: ${String(payload.reason || 'unauthorized')}`);
        console.error(`[bridge] ${reconnectState.lastFailure.hint}`);
        updateBridgeStatus({
          status: 'error',
          deviceId,
          brokerWs,
          brokerHttp,
          gatewayUrl: gateway.gatewayUrl,
          lastDisconnectAt: bridgeNowIso(),
          lastErrorCode: reconnectState.lastFailure.errorCode,
          lastErrorClass: reconnectState.lastFailure.failureClass,
          lastErrorMessage: reconnectState.lastFailure.message,
          hint: reconnectState.lastFailure.hint,
          consecutiveFailures: reconnectState.attempt + 1,
          pid: process.pid,
        });
        try {
          brokerSocket.close(4001, 'auth_rejected');
        } catch {
          // no-op
        }
        return;
      }

      if (payload.type === 'broker.reject_subscription') {
        console.error('[bridge] Broker rejected DeviceChannel subscription.');
        reconnectState.lastFailure = classifyBridgeFailure({
          reason: 'broker rejected DeviceChannel subscription',
          forceClass: 'auth_rejected',
        });
        reconnectState.stopped = true;
        updateBridgeStatus({
          status: 'error',
          deviceId,
          brokerWs,
          brokerHttp,
          gatewayUrl: gateway.gatewayUrl,
          lastDisconnectAt: bridgeNowIso(),
          lastErrorCode: reconnectState.lastFailure.errorCode,
          lastErrorClass: reconnectState.lastFailure.failureClass,
          lastErrorMessage: reconnectState.lastFailure.message,
          hint: reconnectState.lastFailure.hint,
          consecutiveFailures: reconnectState.attempt + 1,
          pid: process.pid,
        });
        try {
          brokerSocket.close(4002, 'subscription_rejected');
        } catch {
          // no-op
        }
        return;
      }

      if (payload.type === 'device.ready') {
        bridgeDebugLog(`[bridge] Broker ready for device ${payload.deviceId || deviceId}.`);
        return;
      }

      if (payload.type === 'client.open') {
        const sessionId = String(payload.sessionId || '').trim();
        if (!sessionId) return;
        bridgeDebugLog(`[bridge] client.open ${sessionId}`);
        getOrCreateGatewaySession(sessionId);
        return;
      }

      if (payload.type === 'client.frame') {
        const sessionId = String(payload.sessionId || '').trim();
        const frame = typeof payload.frame === 'string' ? payload.frame : '';
        if (!sessionId || !frame) return;
        if (classifyBridgeSessionScope(sessionId) === 'voice') {
          bridgeDebugLog(`[bridge] client.frame ${sessionId} ${JSON.stringify(summarizeVoiceFrameContract(frame))}`);
        } else {
          bridgeDebugLog(`[bridge] client.frame ${sessionId}`);
        }
        const sessionBridge = getOrCreateGatewaySession(sessionId);
        if (!sessionBridge) return;
        const requestMeta = extractGatewayRequestMeta(frame);
        if (requestMeta) {
          if (!(sessionBridge.pendingRequests instanceof Map)) {
            sessionBridge.pendingRequests = new Map();
          }
          if (!(sessionBridge.pendingRequestTimers instanceof Map)) {
            sessionBridge.pendingRequestTimers = new Map();
          }
          sessionBridge.pendingRequests.set(requestMeta.requestId, {
            ...requestMeta,
            lastSuccessfulHop: 'broker.accepted',
          });
          if (requestMeta.method === 'chat.send' && requestMeta.correlationId) {
            sessionBridge.lastChatCorrelationId = requestMeta.correlationId;
          }
        }
        const prepared = prepareGatewayFrameForLocalGateway(frame, gateway, {
          connectNonce: sessionBridge.connectNonce,
          deviceIdentity: gatewayDeviceIdentity,
        });
        if (prepared.waitForChallenge) {
          queueConnectUntilChallenge(sessionId, sessionBridge, frame);
          bridgeDebugLog(`[bridge] client.frame waiting for challenge ${sessionId}`);
          if (requestMeta) {
            sendGatewayAck(brokerSocket, {
              sessionId,
              requestId: requestMeta.requestId,
              method: requestMeta.method,
              correlationId: requestMeta.correlationId,
              stage: 'bridge.waiting_for_challenge',
            });
          }
          return;
        }
        if (!prepared.frameText) {
          if (requestMeta) {
            const pending = sessionBridge.pendingRequests instanceof Map
              ? sessionBridge.pendingRequests.get(requestMeta.requestId)
              : null;
            const lastSuccessfulHop = pending && typeof pending.lastSuccessfulHop === 'string' && pending.lastSuccessfulHop
              ? pending.lastSuccessfulHop
              : 'broker.accepted';
            sendGatewayAck(brokerSocket, {
              sessionId,
              requestId: requestMeta.requestId,
              method: requestMeta.method,
              correlationId: requestMeta.correlationId,
              stage: 'bridge.dropped',
            });
            sendGatewayErrorResponse(brokerSocket, {
              sessionId,
              requestMeta,
              code: 'bridge_dropped',
              message: 'Bridge dropped request before forwarding to gateway.',
              lastSuccessfulHop,
              retryable: true,
            });
            if (sessionBridge.pendingRequests instanceof Map) {
              sessionBridge.pendingRequests.delete(requestMeta.requestId);
            }
            clearPendingRequestTimeout(sessionBridge, requestMeta.requestId);
          }
          return;
        }
        const result = forwardFrameToSession(sessionBridge, prepared.frameText, {
          requiresConnectAccepted: Boolean(requestMeta && requestMeta.method !== 'connect'),
        });
        if (result === 'waiting_for_connect') {
          bridgeDebugLog(`[bridge] client.frame waiting for connect ${sessionId}`);
          if (requestMeta) {
            sendGatewayAck(brokerSocket, {
              sessionId,
              requestId: requestMeta.requestId,
              method: requestMeta.method,
              correlationId: requestMeta.correlationId,
              stage: 'bridge.waiting_for_connect',
            });
          }
          return;
        }
        if (result === 'queued') {
          bridgeDebugLog(`[bridge] client.frame queued ${sessionId}`);
          if (requestMeta) {
            startPendingRequestTimeout(brokerSocket, sessionId, sessionBridge, requestMeta);
          }
          if (requestMeta) {
            sendGatewayAck(brokerSocket, {
              sessionId,
              requestId: requestMeta.requestId,
              method: requestMeta.method,
              correlationId: requestMeta.correlationId,
              stage: 'bridge.queued',
            });
          }
        } else if (result === 'dropped') {
          bridgeDebugLog(`[bridge] client.frame dropped (socket not open) ${sessionId}`);
          incrementBridgeMetric('bridge_drop_count');
          if (requestMeta) {
            const pending = sessionBridge.pendingRequests instanceof Map
              ? sessionBridge.pendingRequests.get(requestMeta.requestId)
              : null;
            const lastSuccessfulHop = pending && typeof pending.lastSuccessfulHop === 'string' && pending.lastSuccessfulHop
              ? pending.lastSuccessfulHop
              : 'broker.accepted';
            clearPendingRequestTimeout(sessionBridge, requestMeta.requestId);
            if (sessionBridge.pendingRequests instanceof Map) {
              sessionBridge.pendingRequests.delete(requestMeta.requestId);
            }
            sendGatewayErrorResponse(brokerSocket, {
              sessionId,
              requestMeta,
              code: 'bridge_dropped',
              message: 'Bridge dropped request because gateway socket is not open.',
              lastSuccessfulHop,
              retryable: true,
            });
          }
          if (requestMeta) {
            sendGatewayAck(brokerSocket, {
              sessionId,
              requestId: requestMeta.requestId,
              method: requestMeta.method,
              correlationId: requestMeta.correlationId,
              stage: 'bridge.dropped',
            });
          }
        } else if (requestMeta) {
          startPendingRequestTimeout(brokerSocket, sessionId, sessionBridge, requestMeta);
          sendGatewayAck(brokerSocket, {
            sessionId,
            requestId: requestMeta.requestId,
            method: requestMeta.method,
            correlationId: requestMeta.correlationId,
            stage: 'bridge.forwarded',
          });
        }
        return;
      }

      if (payload.type === 'client.close') {
        const sessionId = String(payload.sessionId || '').trim();
        bridgeDebugLog(`[bridge] client.close ${sessionId}`);
        const sessionBridge = activeGatewaySockets.get(sessionId);
        if (sessionBridge && sessionBridge.socket) {
          clearChallengeTimer(sessionBridge);
          if (sessionBridge.pendingRequests instanceof Map) {
            sessionBridge.pendingRequests.clear();
          }
          clearAllPendingRequestTimeouts(sessionBridge);
          activeGatewaySockets.delete(sessionId);
          sessionBridge.socket.close(1000, 'client_closed');
        }
        return;
      }
    }, (error) => {
      reportBridgeRuntimeFault({ phase: 'broker.message', error });
    }));

    brokerSocket.on('close', runBridgeCallbackSafely((code, reason) => {
      if (actionCableHeartbeat) {
        clearInterval(actionCableHeartbeat);
        actionCableHeartbeat = null;
      }
      const reasonText = reason ? reason.toString() : '';
      bridgeDebugLog(`[bridge] Broker disconnected (${code}) ${reasonText}`);
      incrementBridgeMetric('bridge_disconnect_count');
      for (const [sessionId, sessionBridge] of activeGatewaySockets.entries()) {
        clearChallengeTimer(sessionBridge);
        if (sessionBridge.pendingRequests instanceof Map) {
          sessionBridge.pendingRequests.clear();
        }
        clearAllPendingRequestTimeouts(sessionBridge);
        activeGatewaySockets.delete(sessionId);
        try {
          sessionBridge.socket.close(1001, 'broker_disconnected');
        } catch {
          // no-op
        }
      }

      if (reconnectState.stopped) {
        return;
      }

      if (!reconnectState.lastFailure) {
        reconnectState.lastFailure = classifyBridgeFailure({
          reason: `socket closed code=${String(code)}${reasonText ? ` reason=${reasonText}` : ''}`,
        });
      }
      scheduleReconnect();
    }, (error) => {
      reportBridgeRuntimeFault({ phase: 'broker.close', error });
    }));

    brokerSocket.on('error', runBridgeCallbackSafely((err) => {
      incrementBridgeMetric('bridge_socket_error_count');
      reconnectState.lastFailure = classifyBridgeFailure({ err });
      console.error(
        `[bridge] Broker socket error [${reconnectState.lastFailure.failureClass}/${reconnectState.lastFailure.errorCode}]: ${reconnectState.lastFailure.message}`
      );
      console.error(`[bridge] ${reconnectState.lastFailure.hint}`);
    }, (error) => {
      reportBridgeRuntimeFault({ phase: 'broker.error', error });
    }));
  };

  const markStopped = (signal) => {
    reconnectState.stopped = true;
    if (reconnectState.timer) {
      clearTimeout(reconnectState.timer);
      reconnectState.timer = null;
    }
    personaJobPoller?.stop();
    personaRuntimeSupervisor?.stop();
    process.off('uncaughtException', uncaughtExceptionHandler);
    process.off('unhandledRejection', unhandledRejectionHandler);
    updateBridgeStatus({
      status: 'stopped',
      deviceId,
      brokerWs,
      brokerHttp,
      gatewayUrl: gateway.gatewayUrl,
      lastDisconnectAt: bridgeNowIso(),
      stopSignal: signal,
      pid: process.pid,
    });
    releaseBridgeLock();
    process.exit(0);
  };
  process.once('SIGINT', () => markStopped('SIGINT'));
  process.once('SIGTERM', () => markStopped('SIGTERM'));

  connectBroker();
  await new Promise(() => {});
}

async function pairAndStartOpenclawBridge(flags) {
  const bridgeState = readBridgeState();
  const appUrl = String(flags['app-url'] || process.env.OOMI_APP_URL || 'http://127.0.0.1:3456').trim();
  const deviceId = resolveDeviceId(flags, bridgeState);
  const label = String(flags.label || `${deviceId}-bridge`).trim();
  const sessionKey = String(
    flags['session-key'] ||
    process.env.OOMI_SESSION_KEY ||
    'agent:main:webchat:channel:oomi'
  ).trim();
  const detach = Boolean(flags.detach);
  const shouldStart = !Boolean(flags['no-start']);
  const jsonOutput = isTruthyFlag(flags.json);

  console.log(`Pairing OpenClaw host with Oomi app: ${appUrl}`);
  const managedConfig = await fetchManagedGatewayConfig({ appUrl });
  const pairStarted = await requestManagedPairCode({ appUrl, label });
  const pairCode = String(pairStarted.pairCode || '').trim().toUpperCase();
  if (!pairCode) {
    throw new Error('Pairing code missing from backend response.');
  }

  console.log(`Received pair code: ${pairCode}`);
  const claimed = await claimBridgeDeviceToken({
    brokerHttp: managedConfig.brokerHttpUrl,
    pairCode,
    deviceId,
  });
  const deviceToken = String(claimed.deviceToken || '').trim();
  if (!deviceToken) {
    throw new Error('Broker pair claim did not return deviceToken.');
  }

  const brokerWs = String(flags['broker-ws'] || managedConfig.brokerDeviceWsUrl).trim();
  writeBridgeState({
    brokerHttp: managedConfig.brokerHttpUrl,
    brokerWs,
    deviceId,
    deviceToken,
    sessionKey,
    claimedAt: new Date().toISOString(),
    expiresAt: claimed.expiresAt || null,
  });

  const invite = await requestConnectInviteLink({
    backendHttp: managedConfig.brokerHttpUrl,
    appUrl,
    sessionKey,
    deviceToken,
  });
  const inviteUrl = String(invite.inviteUrl || '').trim();
  const inviteExpiresAt = String(invite.expiresAt || '').trim();

  const pairSummary = {
    deviceId,
    inviteUrl,
    inviteExpiresAt,
    brokerHttpUrl: managedConfig.brokerHttpUrl,
    brokerDeviceWsUrl: brokerWs,
    bridgeMode: shouldStart ? (detach ? 'detached' : 'attached') : 'skipped',
    bridgeStatePath: resolveBridgeStatePath(),
  };

  if (jsonOutput) {
    console.log(JSON.stringify(pairSummary, null, 2));
  } else {
    console.log(`Paired device: ${deviceId}`);
    console.log(`Auth invite URL: ${inviteUrl}`);
    if (inviteExpiresAt) {
      console.log(`Invite expires at: ${inviteExpiresAt}`);
    }
    console.log('');
    console.log('Share this exact response with the user (no extra text):');
    console.log('----------------------------------------');
    console.log('Oomi Connect Ready');
    console.log(`Auth Link: ${inviteUrl}`);
    console.log('----------------------------------------');
  }

  if (!shouldStart) {
    console.log('Bridge start skipped (--no-start).');
    return;
  }

  if (detach) {
    const result = startBridgeDetachedProcess({
      'broker-http': managedConfig.brokerHttpUrl,
      'broker-ws': brokerWs,
      'device-id': deviceId,
      'device-token': deviceToken,
    });
    if (result.alreadyRunning) {
      console.log(`Bridge already running (pid: ${result.pid}).`);
      return;
    }
    console.log(`Bridge started in background (pid: ${result.pid}).`);
    return;
  }

  await startOpenclawBridge({
    ...flags,
    'broker-http': managedConfig.brokerHttpUrl,
    'broker-ws': brokerWs,
    'device-id': deviceId,
    'device-token': deviceToken,
  });
}

async function createOpenclawInviteLink(flags) {
  const bridgeState = readBridgeState();
  const backendHttp = String(
    flags['backend-url'] ||
      flags['broker-http'] ||
      process.env.OOMI_BACKEND_URL ||
      process.env.OOMI_CHAT_BROKER_HTTP_URL ||
      bridgeState.brokerHttp ||
      ''
  ).trim();
  const appUrl = String(flags['app-url'] || process.env.OOMI_APP_URL || 'http://127.0.0.1:3456').trim();
  const sessionKey = String(
    flags['session-key'] ||
      process.env.OOMI_SESSION_KEY ||
      bridgeState.sessionKey ||
      'agent:main:webchat:channel:oomi'
  ).trim();
  const deviceToken = String(flags['device-token'] || bridgeState.deviceToken || '').trim();
  const jsonOutput = isTruthyFlag(flags.json);

  if (!backendHttp) {
    throw new Error('Missing backend URL. Set --backend-url (or --broker-http) or pair first.');
  }
  if (!deviceToken) {
    throw new Error('Missing device token in bridge state. Run: oomi openclaw pair --app-url https://www.oomi.ai --no-start');
  }

  const invite = await requestConnectInviteLink({
    backendHttp,
    appUrl,
    sessionKey,
    deviceToken,
  });

  const summary = {
    appUrl,
    backendHttp,
    inviteUrl: invite.inviteUrl,
    expiresAt: invite.expiresAt || null,
    sessionKey,
  };

  if (jsonOutput) {
    console.log(JSON.stringify(summary, null, 2));
    return;
  }

  console.log('Oomi Auth Invite Ready');
  console.log('----------------------');
  console.log(`Auth Link: ${summary.inviteUrl}`);
  if (summary.expiresAt) {
    console.log(`Expires: ${summary.expiresAt}`);
  }
}

function printOpenclawBridgeStatus(flags) {
  const bridgeState = readBridgeState();
  const runtimeStatus = readBridgeStatus();
  const jsonOutput = isTruthyFlag(flags.json);
  const redactToken = (value) => {
    const text = String(value || '').trim();
    if (!text) return '';
    if (text.length <= 12) return '***';
    return `${text.slice(0, 6)}...${text.slice(-6)}`;
  };

  const payload = {
    bridgeStatePath: resolveBridgeStatePath(),
    bridgeStatusPath: resolveBridgeStatusPath(),
    bridgeState: {
      brokerHttp: String(bridgeState.brokerHttp || ''),
      brokerWs: String(bridgeState.brokerWs || ''),
      deviceId: String(bridgeState.deviceId || ''),
      deviceToken: redactToken(bridgeState.deviceToken),
      claimedAt: bridgeState.claimedAt || null,
      expiresAt: bridgeState.expiresAt || null,
    },
    runtime: runtimeStatus,
  };

  if (jsonOutput) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  console.log('Oomi Bridge Status');
  console.log('------------------');
  console.log(`Bridge state: ${payload.bridgeStatePath}`);
  console.log(`Runtime status: ${payload.bridgeStatusPath}`);
  console.log(`Device: ${payload.bridgeState.deviceId || 'not paired'}`);
  console.log(`Broker HTTP: ${payload.bridgeState.brokerHttp || 'not configured'}`);
  console.log(`Broker WS: ${payload.bridgeState.brokerWs || 'not configured'}`);
  if (payload.bridgeState.deviceToken) {
    console.log(`Device token: ${payload.bridgeState.deviceToken}`);
  }
  if (payload.runtime && typeof payload.runtime === 'object' && Object.keys(payload.runtime).length > 0) {
    console.log(`Runtime state: ${String(payload.runtime.status || 'unknown')}`);
    if (payload.runtime.lastConnectedAt) {
      console.log(`Last connected: ${payload.runtime.lastConnectedAt}`);
    }
    if (payload.runtime.lastDisconnectAt) {
      console.log(`Last disconnected: ${payload.runtime.lastDisconnectAt}`);
    }
    if (payload.runtime.lastErrorClass || payload.runtime.lastErrorCode || payload.runtime.lastErrorMessage) {
      console.log(
        `Last error: ${String(payload.runtime.lastErrorClass || 'unknown')}/${String(payload.runtime.lastErrorCode || 'UNKNOWN')} ${String(payload.runtime.lastErrorMessage || '').trim()}`
      );
    }
    if (payload.runtime.hint) {
      console.log(`Hint: ${payload.runtime.hint}`);
    }
    if (payload.runtime.metrics && typeof payload.runtime.metrics === 'object') {
      const metrics = normalizeBridgeMetrics(payload.runtime.metrics);
      const metricPairs = Object.entries(metrics);
      if (metricPairs.length > 0) {
        console.log('Metrics:');
        for (const [name, value] of metricPairs) {
          console.log(`  ${name}: ${value}`);
        }
      }
    }
    return;
  }

  console.log('Runtime state: no bridge runtime status recorded yet.');
  console.log('Run: oomi openclaw bridge --app-url https://www.oomi.ai');
}

function printOpenclawPluginSetup(flags) {
  const bridgeState = readBridgeState();
  const backendUrl = String(
    flags['backend-url'] ||
      process.env.OOMI_BACKEND_URL ||
      process.env.OOMI_CHAT_BROKER_HTTP_URL ||
      bridgeState.brokerHttp ||
      ''
  ).trim();
  const deviceToken = String(
    flags['device-token'] ||
      bridgeState.deviceToken ||
      ''
  ).trim();
  const showSecrets = isTruthyFlag(flags['show-secrets']);
  const redactToken = (value) => {
    if (!value) return '';
    if (showSecrets) return value;
    if (value.length <= 12) return '***';
    return `${value.slice(0, 6)}...${value.slice(-6)}`;
  };
  const defaultSessionKey = String(
    flags['session-key'] ||
      process.env.OOMI_SESSION_KEY ||
      'agent:main:webchat:channel:oomi'
  ).trim();

  console.log('OpenClaw Oomi Plugin Setup');
  console.log('--------------------------');
  console.log('1) Install extension package in OpenClaw:');
  console.log('   openclaw plugins install oomi-ai@latest');
  console.log('');
  console.log('2) Configure OpenClaw channel account (channels.oomi.accounts.default):');
  console.log(
    JSON.stringify(
      {
        channels: {
          oomi: {
            defaultAccountId: 'default',
            accounts: {
              default: {
                enabled: true,
                backendUrl,
                deviceToken: redactToken(deviceToken),
                defaultSessionKey,
              },
            },
          },
        },
      },
      null,
      2
    )
  );
  if (deviceToken && !showSecrets) {
    console.log('Token is redacted by default. Use --show-secrets to print full values.');
    console.log(`Bridge state file: ${resolveBridgeStatePath()}`);
  }
  console.log('');

  if (!backendUrl || !deviceToken) {
    console.log('Missing backend/device credentials in local state.');
    console.log('Run: oomi openclaw pair --app-url https://www.oomi.ai --no-start');
    console.log('Then run: oomi openclaw plugin');
  }
}

async function handleBridgeServiceCommand(actionRaw = '', flags = {}) {
  assertMacOSLaunchdAvailable();
  const action = String(actionRaw || 'status').trim().toLowerCase();
  const plistPath = resolveBridgeLaunchAgentPlistPath();

  if (action === 'install') {
    ensureDir(path.dirname(plistPath));
    writeFile(plistPath, buildBridgeLaunchAgentPlist());
    console.log(`Installed bridge launchd plist: ${plistPath}`);
    if (isTruthyFlag(flags['no-start'])) {
      console.log('Service install complete. Start with: oomi openclaw bridge service start');
      return;
    }
    startBridgeLaunchdService();
    incrementBridgeMetric('bridge_start_count');
    console.log(`Bridge service started: ${launchctlServiceTarget()}`);
    return;
  }

  if (action === 'uninstall') {
    await stopBridgeLaunchdService();
    if (fs.existsSync(plistPath)) {
      fs.unlinkSync(plistPath);
    }
    console.log(`Removed bridge launchd plist: ${plistPath}`);
    return;
  }

  if (action === 'start') {
    startBridgeLaunchdService();
    incrementBridgeMetric('bridge_start_count');
    console.log(`Bridge service started: ${launchctlServiceTarget()}`);
    return;
  }

  if (action === 'stop') {
    const stopped = await stopBridgeLaunchdService();
    if (Array.isArray(stopped.found) && stopped.found.length > 0) {
      console.log(`Stopped bridge workers: ${stopped.stopped.join(', ') || 'none'}.`);
    } else {
      console.log('No bridge workers running.');
    }
    console.log(`Bridge service stopped: ${launchctlServiceTarget()}`);
    return;
  }

  if (action === 'restart') {
    await stopBridgeLaunchdService();
    startBridgeLaunchdService();
    incrementBridgeMetric('bridge_restart_count');
    console.log(`Bridge service restarted: ${launchctlServiceTarget()}`);
    return;
  }

  if (action === 'status') {
    const status = readBridgeLaunchdStatus();
    console.log('Bridge Service Status');
    console.log('---------------------');
    console.log(`Label: ${BRIDGE_LAUNCHD_LABEL}`);
    console.log(`Target: ${status.target}`);
    console.log(`Plist: ${status.plistPath}`);
    console.log(`Installed: ${status.installed ? 'yes' : 'no'}`);
    console.log(`Loaded: ${status.loaded ? 'yes' : 'no'}`);
    console.log(`Running: ${status.running ? 'yes' : 'no'}`);
    if (status.pid) {
      console.log(`PID: ${status.pid}`);
    }
    if (status.lastExitCode !== null) {
      console.log(`Last exit code: ${status.lastExitCode}`);
    }
    return;
  }

  throw new Error(
    `Unknown bridge service action: ${action}. Use: oomi openclaw bridge service [install|start|stop|restart|status|uninstall]`
  );
}

async function startBridgeLifecycle(flags = {}) {
  const serviceManaged = isServiceManagedBridgeStart(flags);
  if (serviceManaged && Boolean(flags.detach)) {
    throw new Error('Detached bridge mode cannot be combined with --service-managed.');
  }

  if (Boolean(flags.detach)) {
    const detachedFlags = { ...flags };
    delete detachedFlags.detach;
    const result = startBridgeDetachedProcess(detachedFlags);
    if (result.alreadyRunning) {
      incrementBridgeMetric('duplicate_start_attempt_count');
      console.log(`Bridge already running (pid: ${result.pid}).`);
      return;
    }
    incrementBridgeMetric('bridge_start_count');
    console.log(`Bridge started in background (pid: ${result.pid}).`);
    return;
  }

  const running = findRunningBridgeProcess();
  if (running) {
    if (!serviceManaged) {
      incrementBridgeMetric('duplicate_start_attempt_count');
      console.log(
        `Bridge already running (pid ${running.pid})${running.deviceId ? ` for device ${running.deviceId}` : ''}.`
      );
      return;
    }

    incrementBridgeMetric('bridge_restart_count');
    console.log(
      `Service-managed bridge start detected existing bridge (pid ${running.pid})${running.deviceId ? ` for device ${running.deviceId}` : ''}; reclaiming ownership.`
    );
    const result = await stopBridgeProcesses();
    if (Array.isArray(result.stillAlive) && result.stillAlive.length > 0) {
      throw new Error(`Failed to stop bridge processes: ${result.stillAlive.join(', ')}`);
    }
  }

  incrementBridgeMetric('bridge_start_count');
  await startOpenclawBridge(flags);
}

async function handleBridgeLifecycleCommand(flags = {}, actionRaw = '') {
  const action = String(actionRaw || 'start').trim().toLowerCase();

  if (action === 'start' || action === 'ensure') {
    await startBridgeLifecycle(flags);
    return;
  }

  if (action === 'ps') {
    const pids = listBridgeProcessPids();
    if (pids.length === 0) {
      console.log('No bridge processes running.');
      return;
    }
    console.log(`Bridge processes: ${pids.join(', ')}`);
    return;
  }

  if (action === 'stop') {
    const result = await stopBridgeProcesses();
    if (result.found.length === 0) {
      console.log('No bridge processes running.');
      return;
    }
    console.log(`Stopped bridge processes: ${result.stopped.join(', ') || 'none'}.`);
    if (result.forceKilled.length > 0) {
      console.log(`Force-killed bridge processes: ${result.forceKilled.join(', ')}.`);
    }
    if (Array.isArray(result.stillAlive) && result.stillAlive.length > 0) {
      throw new Error(`Failed to stop bridge processes: ${result.stillAlive.join(', ')}`);
    }
    return;
  }

  if (action === 'restart') {
    incrementBridgeMetric('bridge_restart_count');
    const result = await stopBridgeProcesses();
    if (result.found.length > 0) {
      console.log(`Stopped bridge processes: ${result.stopped.join(', ') || 'none'}.`);
      if (result.forceKilled.length > 0) {
        console.log(`Force-killed bridge processes: ${result.forceKilled.join(', ')}.`);
      }
    } else {
      console.log('No existing bridge process found; starting fresh bridge.');
    }
    if (Array.isArray(result.stillAlive) && result.stillAlive.length > 0) {
      throw new Error(`Failed to stop bridge processes: ${result.stillAlive.join(', ')}`);
    }
    await startBridgeLifecycle(flags);
    return;
  }

  throw new Error(
    `Unknown bridge action: ${action}. Use: oomi openclaw bridge [start|ensure|stop|restart|ps]`
  );
}

async function main() {
  const args = parseArgs(process.argv);
  const command = args.command;
  const subcommand = args.subcommand;

  if (!command || command === 'help' || command === '--help') {
    usage();
    process.exit(0);
  }

  await maybeNotifyUpdate(command);

  if (command === 'init') {
    const agentsPath = resolveAgentsFile(args.flags['agents-file'], args.flags.workspace);
    installInstructions(agentsPath);
    console.log(`Installed Oomi agent instructions into ${agentsPath}`);
    console.log('Restart OpenClaw to pick up changes.');
    return;
  }

  if (command === 'openclaw' && subcommand === 'install') {
    const agentsPath = resolveAgentsFile(args.flags['agents-file'], args.flags.workspace);
    const skillSource = resolveSkillSource(args.flags.root);
    const skillTargets = resolveSkillTargets(args.flags['skills-dir']);
    installInstructions(agentsPath);
    installSkill(skillSource, skillTargets);
    console.log(`Installed Oomi agent instructions into ${agentsPath}`);
    console.log('Restart OpenClaw to pick up changes.');
    return;
  }

  if (command === 'openclaw' && subcommand === 'bridge') {
    const bridgeAction = String(args.positionals[0] || 'start').trim().toLowerCase();
    if (bridgeAction === 'service') {
      const serviceAction = args.positionals[1] || 'status';
      await handleBridgeServiceCommand(serviceAction, args.flags);
      return;
    }
    await handleBridgeLifecycleCommand(args.flags, bridgeAction);
    return;
  }

  if (command === 'openclaw' && subcommand === 'pair') {
    await pairAndStartOpenclawBridge(args.flags);
    return;
  }

  if (command === 'openclaw' && subcommand === 'invite') {
    await createOpenclawInviteLink(args.flags);
    return;
  }

  if (command === 'openclaw' && subcommand === 'status') {
    printOpenclawBridgeStatus(args.flags);
    return;
  }

  if (command === 'openclaw' && subcommand === 'plugin') {
    printOpenclawPluginSetup(args.flags);
    return;
  }

  if (command === 'openclaw' && subcommand === 'profile') {
    await handleOpenclawProfileCommand(args.positionals[0], args.flags);
    return;
  }

  if (command === 'openclaw' && subcommand === 'debug') {
    await handleOpenclawDebugCommand(args.positionals[0], args.flags);
    return;
  }

  if (command === 'openclaw' && subcommand === 'refresh') {
    await handleOpenclawRefreshCommand(args.flags);
    return;
  }

  if (command === 'personas' && subcommand === 'sync') {
    await syncPersonas({ backendUrl: args.flags['backend-url'], root: args.flags.root });
    return;
  }

  if (command === 'personas' && subcommand === 'create') {
    const id = args.positionals[0];
    if (!id) {
      throw new Error('Persona id is required. Usage: oomi personas create <id>');
    }
    await createPersona({ id, root: args.flags.root, flags: args.flags });
    return;
  }

  if (command === 'personas' && subcommand === 'create-managed') {
    await handlePersonaCreateManagedCommand(args.flags, args.positionals[0]);
    return;
  }

  if (command === 'personas' && subcommand === 'launch-managed') {
    await handlePersonaLaunchManagedCommand(args.flags, args.positionals[0]);
    return;
  }

  if (command === 'personas' && subcommand === 'scaffold') {
    const slug = args.positionals[0];
    if (!slug) {
      throw new Error('Persona slug is required. Usage: oomi personas scaffold <slug> --name "<name>" --description "<description>" --out <path>');
    }
    const result = scaffoldPersonaApp({
      slug,
      name: args.flags.name,
      description: args.flags.description,
      outDir: args.flags.out,
      templateVersion: args.flags['template-version'],
      force: isTruthyFlag(args.flags.force),
    });
    printPersonaScaffoldResult(result, isTruthyFlag(args.flags.json));
    return;
  }

  if (command === 'personas' && subcommand === 'runtime-register') {
    const slug = args.positionals[0];
    if (!slug) {
      throw new Error('Persona slug is required. Usage: oomi personas runtime-register <slug> --local-port 4789');
    }
    await handlePersonaRuntimeRegisterCommand(slug, args.flags);
    return;
  }

  if (command === 'personas' && subcommand === 'status') {
    const slug = args.positionals[0];
    if (!slug) {
      throw new Error('Persona slug is required. Usage: oomi personas status <slug>');
    }
    await handlePersonaStatusCommand(slug, args.flags);
    return;
  }

  if (command === 'personas' && subcommand === 'stop') {
    const slug = args.positionals[0];
    if (!slug) {
      throw new Error('Persona slug is required. Usage: oomi personas stop <slug>');
    }
    await handlePersonaStopCommand(slug, args.flags);
    return;
  }

  if (command === 'personas' && subcommand === 'delete') {
    const slug = args.positionals[0];
    if (!slug) {
      throw new Error('Persona slug is required. Usage: oomi personas delete <slug>');
    }
    await handlePersonaDeleteCommand(slug, args.flags);
    return;
  }

  if (command === 'personas' && subcommand === 'heartbeat') {
    const slug = args.positionals[0];
    if (!slug) {
      throw new Error('Persona slug is required. Usage: oomi personas heartbeat <slug> --local-port 4789');
    }
    await handlePersonaHeartbeatCommand(slug, args.flags);
    return;
  }

  if (command === 'personas' && subcommand === 'runtime-fail') {
    const slug = args.positionals[0];
    if (!slug) {
      throw new Error('Persona slug is required. Usage: oomi personas runtime-fail <slug> --code RUNTIME_FAILED --message "<text>"');
    }
    await handlePersonaRuntimeFailCommand(slug, args.flags);
    return;
  }

  if (command === 'persona-jobs' && subcommand === 'start') {
    const jobId = args.positionals[0];
    if (!jobId) {
      throw new Error('Persona job id is required. Usage: oomi persona-jobs start <jobId>');
    }
    await handlePersonaJobStartCommand(jobId, args.flags);
    return;
  }

  if (command === 'persona-jobs' && subcommand === 'succeed') {
    const jobId = args.positionals[0];
    if (!jobId) {
      throw new Error('Persona job id is required. Usage: oomi persona-jobs succeed <jobId> --workspace-path <path> --local-port 4789');
    }
    await handlePersonaJobSucceedCommand(jobId, args.flags);
    return;
  }

  if (command === 'persona-jobs' && subcommand === 'fail') {
    const jobId = args.positionals[0];
    if (!jobId) {
      throw new Error('Persona job id is required. Usage: oomi persona-jobs fail <jobId> --code JOB_FAILED --message "<text>"');
    }
    await handlePersonaJobFailCommand(jobId, args.flags);
    return;
  }

  if (command === 'persona-jobs' && subcommand === 'execute') {
    await handlePersonaJobExecuteCommand(args.flags);
    return;
  }

  console.error(`Unknown command: ${command} ${subcommand || ''}`.trim());
  usage();
  process.exit(1);
}

const __currentFilePath = fileURLToPath(import.meta.url);
const __invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : '';
const __isDirectExecution = Boolean(__invokedPath) && __invokedPath === path.resolve(__currentFilePath);

if (__isDirectExecution) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}

export {
  prepareGatewayFrameForLocalGateway,
  ensureAssistantSpokenMetadata,
  normalizeAssistantGatewayFrame,
  runAssistantFinalDebugCheck,
  buildOpenclawProfileFromFlags,
  handleOpenclawProfileCommand,
  buildBridgeLaunchAgentPlist,
  classifyBridgeFailure,
  classifyBridgeSessionScope,
  createBridgeProcessFaultHandler,
  computeReconnectDelayMs,
  resolveBridgeStatusForBrokerOpen,
  resolveBridgeStatusForRuntimeFault,
  runBridgeCallbackSafely,
  extractGatewayRequestMeta,
  extractGatewayResponseMeta,
  isServiceManagedBridgeStart,
  isGatewayRunStartedFrame,
  isBridgeWorkerCommand,
  parsePositiveInteger,
  collectManagedPersonaRefreshTargets,
  discoverBackendLinkedPersonaRefreshTargets,
  normalizeBackendPersonaRefreshRecord,
  resolvePersonaRuntimeInput,
  resolveExistingWorkspacePathForSlug,
};
