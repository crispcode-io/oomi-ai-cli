import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { resolveOpenclawPersonasDir } from './openclawPaths.js';
import {
  DEFAULT_TEMPLATE_ID,
  DEFAULT_TEMPLATE_VERSION,
  renderTemplateFile,
  resolveTemplateRoot,
} from './template.js';

const PACKAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PERSONA_TEMPLATE_ROOT = resolveTemplateRoot(
  DEFAULT_TEMPLATE_ID,
  DEFAULT_TEMPLATE_VERSION,
);
const PERSONA_TEMPLATE_PACKAGE_JSON_PATH = path.join(PERSONA_TEMPLATE_ROOT, 'package.json');
const PERSONA_TEMPLATE_PACKAGE_JSON = fs.existsSync(PERSONA_TEMPLATE_PACKAGE_JSON_PATH)
  ? JSON.parse(fs.readFileSync(PERSONA_TEMPLATE_PACKAGE_JSON_PATH, 'utf8'))
  : {};
const WEBSPATIAL_VENDOR_ROOT = path.join(
  PACKAGE_ROOT,
  'templates',
  'persona-app',
  'vendor',
  'webspatial',
);
const VENDORED_WEBSPATIAL_CORE_SPEC = 'file:./vendor/webspatial/core-sdk';
const VENDORED_WEBSPATIAL_REACT_SPEC = 'file:./vendor/webspatial/react-sdk';
const WEBSPATIAL_RUNTIME_BASE_PATH = '/webspatial/avp';
const WEBSPATIAL_TEMPLATE_DEV_DEPENDENCIES = [
  '@webspatial/builder',
  '@webspatial/platform-visionos',
  '@webspatial/vite-plugin',
];
const LEGACY_WEBSPATIAL_TEMPLATE_FILE_RULES = [
  {
    relativePath: 'oomi.runtime.json',
    shouldReplace: (content) =>
      content.includes('"renderMode": "webspatial"') &&
      content.includes('"healthPath": "/oomi.health.json"'),
  },
  {
    relativePath: 'package.json',
    shouldReplace: (content) =>
      content.includes('vite --host 127.0.0.1 --port 4789') ||
      content.includes('vite preview --host 127.0.0.1 --port 4789'),
  },
  {
    relativePath: path.join('src', 'spatial.ts'),
    shouldReplace: (content) =>
      !content.includes('WEBSPATIAL_FORK_REPOSITORY') ||
      !content.includes('configurePersonaScene') ||
      !content.includes('"--xr-back": String(back)') ||
      content.includes('WEBSPATIAL_FORK_COMMIT = "b2746721e4fe6b4f86dac0ea55938074eea00cda"') ||
      content.includes('WEBSPATIAL_FORK_COMMIT = "8904ac8fec48fe49ee14d1739237bd1afb2894fe"'),
  },
  {
    relativePath: path.join('src', 'main.tsx'),
    shouldReplace: (content) =>
      !content.includes('snapdom') &&
      !content.includes('html2canvas') &&
      content.includes('createRoot(document.getElementById("root")!)'),
  },
  {
    relativePath: path.join('src', 'App.tsx'),
    shouldReplace: (content) =>
      !content.includes('const isSpatialRuntime = __XR_ENV_BASE__.startsWith("/webspatial/avp");') ||
      !content.includes('<Route path="home" element={<HomePage />} />') ||
      content.includes('<Route path="/" element={<HomePage />} />') ||
      content.includes('<Route path="/scene" element={<ScenePage />} />') ||
      content.includes('<Route index element={<HomePage />} />'),
  },
  {
    relativePath: path.join('src', 'pages', 'HomePage.tsx'),
    shouldReplace: (content) =>
      (content.includes('Open Spatial Scene') &&
      content.includes('Open Scene Route')) ||
      content.includes('sceneMode') ||
      content.includes('configurePersonaScene();') ||
      content.includes('persona-preview-card') ||
      content.includes('Launch Spatial Surface') ||
      content.includes('Open Spatial Preview') ||
      (
        content.includes('persona-panel persona-runtime" enable-xr') ||
        content.includes('persona-button" onClick={openPersonaScene} enable-xr') ||
        content.includes('persona-link" to="/scene" target="_blank" enable-xr') ||
        content.includes('persona-card" enable-xr style={xrStyle(')
      ),
  },
  {
    relativePath: path.join('src', 'pages', 'ScenePage.tsx'),
    shouldReplace: (content) =>
      content.includes('sceneMode') ||
      (
        !content.includes('enable-xr-monitor') &&
        content.includes(
          'This route is intentionally separate so WebSpatial scene launching has a dedicated',
        )
      ) ||
      (
        content.includes('Awaiting AndroidXR interaction') &&
        content.includes('Interaction Console') &&
        content.includes('Fork-backed proof points')
      ),
  },
  {
    relativePath: path.join('src', 'index.css'),
    shouldReplace: (content) =>
      !content.includes('html.is-spatial #root') ||
      content.includes('radial-gradient(circle at top, rgba(205, 183, 143, 0.32), transparent 36%)'),
  },
  {
    relativePath: path.join('src', 'App.css'),
    shouldReplace: (content) =>
      content.includes('.persona-shell') ||
      (content.includes('.scene-panel') && !content.includes('.scene-interaction-grid')) ||
      content.includes('html.is-spatial .persona-runtime {') ||
      content.includes('html.is-spatial .persona-scene-root {') ||
      content.includes('html.is-spatial .persona-button,') ||
      content.includes('html.is-spatial .persona-card,') ||
      !content.includes('.scene-workspace-grid') ||
      !content.includes('.home-grid'),
  },
  {
    relativePath: 'vite.config.ts',
    shouldReplace: (content) =>
      content.includes('webSpatial()') && !content.includes('optimizeDeps'),
  },
];

function resolveNpmCommand() {
  return process.platform === 'win32' ? 'npm.cmd' : 'npm';
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function readJsonFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return null;
  }

  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function copyDirectory(sourcePath, targetPath) {
  ensureDir(targetPath);
  let changed = false;
  const sourceEntries = fs.readdirSync(sourcePath, { withFileTypes: true });
  const sourceEntryNames = new Set(sourceEntries.map((entry) => entry.name));
  const existingTargetEntries = fs.readdirSync(targetPath, { withFileTypes: true });

  for (const entry of existingTargetEntries) {
    if (sourceEntryNames.has(entry.name)) {
      continue;
    }
    fs.rmSync(path.join(targetPath, entry.name), { recursive: true, force: true });
    changed = true;
  }

  for (const entry of sourceEntries) {
    const sourceEntryPath = path.join(sourcePath, entry.name);
    const targetEntryPath = path.join(targetPath, entry.name);
    const targetExists = fs.existsSync(targetEntryPath);

    if (entry.isDirectory()) {
      if (targetExists && !fs.statSync(targetEntryPath).isDirectory()) {
        fs.rmSync(targetEntryPath, { recursive: true, force: true });
        changed = true;
      }
      if (copyDirectory(sourceEntryPath, targetEntryPath)) {
        changed = true;
      }
      continue;
    }

    if (targetExists && fs.statSync(targetEntryPath).isDirectory()) {
      fs.rmSync(targetEntryPath, { recursive: true, force: true });
      changed = true;
    }

    const sourceBuffer = fs.readFileSync(sourceEntryPath);
    const targetBuffer = fs.existsSync(targetEntryPath)
      ? fs.readFileSync(targetEntryPath)
      : null;
    if (targetBuffer && sourceBuffer.equals(targetBuffer)) {
      continue;
    }

    fs.copyFileSync(sourceEntryPath, targetEntryPath);
    changed = true;
  }

  return changed;
}

function quoteWindowsCommandPart(value) {
  const text = String(value);
  if (!/[\s"]/u.test(text)) {
    return text;
  }
  return `"${text.replace(/"/g, '""')}"`;
}

function buildWindowsCommandLine(command, args) {
  const quotedCommand = quoteWindowsCommandPart(command);
  const quotedArgs = args.map((value) => quoteWindowsCommandPart(value)).join(' ');
  return `${quotedCommand}${quotedArgs ? ` ${quotedArgs}` : ''}`;
}

function normalizePositiveInteger(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }
  return Math.floor(parsed);
}

function isWildcardHost(host) {
  const normalized = String(host || '').trim().toLowerCase();
  return normalized === '0.0.0.0' || normalized === '::' || normalized === '[::]';
}

function isLoopbackHost(host) {
  const normalized = String(host || '').trim().toLowerCase();
  return normalized === 'localhost' || normalized === '127.0.0.1' || normalized === '::1' || normalized === '[::1]';
}

function isPrivateIpv4(address) {
  if (!/^\d+\.\d+\.\d+\.\d+$/u.test(address)) {
    return false;
  }

  const [first, second] = address.split('.').map((segment) => Number(segment));
  if (first === 10) return true;
  if (first === 192 && second === 168) return true;
  if (first === 172 && second >= 16 && second <= 31) return true;
  return false;
}

function scorePersonaNetworkCandidate(candidate) {
  let score = 0;
  const name = String(candidate.name || '').toLowerCase();
  const address = String(candidate.address || '');

  if (isPrivateIpv4(address)) score += 40;
  if (address.startsWith('192.168.')) score += 8;
  if (address.startsWith('10.')) score += 6;
  if (/ethernet|wi-?fi|wlan|en\d|eth\d/iu.test(name)) score += 12;
  if (/hyper-v|vethernet|wsl|docker|vmware|virtualbox|tailscale|loopback|bridge/iu.test(name)) score -= 30;
  if (address.startsWith('169.254.')) score -= 100;
  return score;
}

function formatPersonaRuntimeHostForUrl(host) {
  const safeHost = String(host || '').trim();
  if (!safeHost) {
    return '127.0.0.1';
  }
  if (safeHost.includes(':') && !safeHost.startsWith('[')) {
    return `[${safeHost}]`;
  }
  return safeHost;
}

export function resolvePersonaBindHost() {
  const value = String(process.env.OOMI_PERSONA_BIND_HOST || '').trim();
  return value || '0.0.0.0';
}

export function resolvePersonaReachableHost({
  bindHost = resolvePersonaBindHost(),
  env = process.env,
  networkInterfaces = os.networkInterfaces(),
} = {}) {
  const explicit = String(env.OOMI_PERSONA_PUBLIC_HOST || '').trim();
  if (explicit) {
    return explicit;
  }

  const safeBindHost = String(bindHost || '').trim();
  if (safeBindHost && !isWildcardHost(safeBindHost) && !isLoopbackHost(safeBindHost)) {
    return safeBindHost;
  }

  const candidates = [];
  for (const [name, entries] of Object.entries(networkInterfaces || {})) {
    for (const entry of Array.isArray(entries) ? entries : []) {
      if (!entry || entry.internal || entry.family !== 'IPv4') {
        continue;
      }

      const address = String(entry.address || '').trim();
      if (!address || isLoopbackHost(address) || address.startsWith('169.254.')) {
        continue;
      }

      candidates.push({
        name,
        address,
      });
    }
  }

  const winner = candidates
    .sort((left, right) => scorePersonaNetworkCandidate(right) - scorePersonaNetworkCandidate(left))[0];

  return winner?.address || '127.0.0.1';
}

function trimString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizePersonaHealthPath(healthPath, runtimeConfig = {}) {
  const safeHealthPath = trimString(healthPath) || '/oomi.health.json';
  const renderMode = trimString(runtimeConfig?.renderMode).toLowerCase();
  if (renderMode !== 'webspatial') {
    return safeHealthPath;
  }

  if (safeHealthPath.startsWith(`${WEBSPATIAL_RUNTIME_BASE_PATH}/`)) {
    return safeHealthPath;
  }

  const normalizedSuffix = safeHealthPath.startsWith('/') ? safeHealthPath : `/${safeHealthPath}`;
  return `${WEBSPATIAL_RUNTIME_BASE_PATH}${normalizedSuffix}`;
}

function readPersonaConfigLiteral(source, key) {
  if (!source) {
    return '';
  }

  const match = source.match(new RegExp(`${key}:\\s*"([^"]*)"`, 'u'));
  return trimString(match?.[1] || '');
}

function resolvePersonaTemplateVariables(workspacePath) {
  const personaConfigSource = fs.existsSync(path.join(workspacePath, 'src', 'persona', 'config.ts'))
    ? fs.readFileSync(path.join(workspacePath, 'src', 'persona', 'config.ts'), 'utf8')
    : '';
  const personaJson = readJsonFile(path.join(workspacePath, 'persona.json')) || {};
  const runtimeConfig = readPersonaRuntimeConfig(workspacePath);
  const slug =
    readPersonaConfigLiteral(personaConfigSource, 'slug') ||
    trimString(personaJson.id) ||
    path.basename(path.resolve(workspacePath));
  const name =
    readPersonaConfigLiteral(personaConfigSource, 'name') ||
    trimString(personaJson.name) ||
    slug;
  const description =
    readPersonaConfigLiteral(personaConfigSource, 'description') ||
    trimString(personaJson.summary) ||
    name;
  const templateVersion =
    readPersonaConfigLiteral(personaConfigSource, 'templateVersion') ||
    trimString(personaJson.promptTemplateVersion) ||
    trimString(runtimeConfig.templateVersion) ||
    DEFAULT_TEMPLATE_VERSION;

  return {
    __OOMI_PERSONA_SLUG__: slug,
    __OOMI_PERSONA_NAME__: name,
    __OOMI_PERSONA_DESCRIPTION__: description,
    __OOMI_TEMPLATE_VERSION__: templateVersion,
  };
}

function renderPersonaTemplateFile({ workspacePath, relativePath }) {
  const sourcePath = path.join(PERSONA_TEMPLATE_ROOT, relativePath);
  const content = fs.readFileSync(sourcePath, 'utf8');
  return renderTemplateFile(content, resolvePersonaTemplateVariables(workspacePath));
}

function readPersonaRuntimeConfig(workspacePath) {
  if (!workspacePath) {
    return {};
  }

  const runtimeConfigPath = path.join(workspacePath, 'oomi.runtime.json');
  if (!fs.existsSync(runtimeConfigPath)) {
    return {};
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(runtimeConfigPath, 'utf8'));
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function isWebSpatialRuntime(workspacePath) {
  const runtimeConfig = readPersonaRuntimeConfig(workspacePath);
  return trimString(runtimeConfig?.renderMode).toLowerCase() === 'webspatial';
}

export function syncVendoredWebSpatialPackages({
  workspacePath,
} = {}) {
  if (!workspacePath || !isWebSpatialRuntime(workspacePath)) {
    return false;
  }

  const packageJsonPath = path.join(workspacePath, 'package.json');
  if (!fs.existsSync(packageJsonPath)) {
    return false;
  }

  const vendorTargetRoot = path.join(workspacePath, 'vendor', 'webspatial');
  let changed = false;
  if (fs.existsSync(WEBSPATIAL_VENDOR_ROOT)) {
    changed = copyDirectory(WEBSPATIAL_VENDOR_ROOT, vendorTargetRoot) || changed;
  }

  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  const dependencies =
    packageJson.dependencies && typeof packageJson.dependencies === 'object'
      ? packageJson.dependencies
      : {};
  const devDependencies =
    packageJson.devDependencies && typeof packageJson.devDependencies === 'object'
      ? packageJson.devDependencies
      : {};
  const scripts =
    packageJson.scripts && typeof packageJson.scripts === 'object'
      ? packageJson.scripts
      : {};
  if (dependencies['@webspatial/core-sdk'] !== VENDORED_WEBSPATIAL_CORE_SPEC) {
    dependencies['@webspatial/core-sdk'] = VENDORED_WEBSPATIAL_CORE_SPEC;
    changed = true;
  }

  if (dependencies['@webspatial/react-sdk'] !== VENDORED_WEBSPATIAL_REACT_SPEC) {
    dependencies['@webspatial/react-sdk'] = VENDORED_WEBSPATIAL_REACT_SPEC;
    changed = true;
  }

  if (!dependencies['@zumer/snapdom']) {
    dependencies['@zumer/snapdom'] = '^1.9.14';
    changed = true;
  }

  if (!dependencies['html2canvas']) {
    dependencies['html2canvas'] = '^1.4.1';
    changed = true;
  }

  for (const dependencyName of WEBSPATIAL_TEMPLATE_DEV_DEPENDENCIES) {
    const expectedVersion = trimString(
      PERSONA_TEMPLATE_PACKAGE_JSON?.devDependencies?.[dependencyName],
    );
    if (!expectedVersion) {
      continue;
    }
    if (devDependencies[dependencyName] !== expectedVersion) {
      devDependencies[dependencyName] = expectedVersion;
      changed = true;
    }
  }

  for (const scriptName of ['dev:avp', 'build']) {
    const expectedScript = trimString(PERSONA_TEMPLATE_PACKAGE_JSON?.scripts?.[scriptName]);
    if (!expectedScript || trimString(scripts[scriptName])) {
      continue;
    }
    scripts[scriptName] = expectedScript;
    changed = true;
  }

  if (changed) {
    packageJson.dependencies = dependencies;
    packageJson.devDependencies = devDependencies;
    packageJson.scripts = scripts;
    fs.writeFileSync(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`, 'utf8');
  }

  return changed;
}

export function syncLegacyWebSpatialScaffoldFiles({
  workspacePath,
} = {}) {
  if (!workspacePath || !isWebSpatialRuntime(workspacePath)) {
    return false;
  }

  let changed = false;
  for (const rule of LEGACY_WEBSPATIAL_TEMPLATE_FILE_RULES) {
    const targetPath = path.join(workspacePath, rule.relativePath);
    const targetExists = fs.existsSync(targetPath);
    const currentContent = targetExists ? fs.readFileSync(targetPath, 'utf8') : '';
    if (targetExists && !rule.shouldReplace(currentContent)) {
      continue;
    }

    const renderedContent = renderPersonaTemplateFile({
      workspacePath,
      relativePath: rule.relativePath,
    });
    if (currentContent === renderedContent) {
      continue;
    }

    ensureDir(path.dirname(targetPath));
    fs.writeFileSync(targetPath, renderedContent, 'utf8');
    changed = true;
  }

  return changed;
}

function readProcessCommandLine(pid) {
  const safePid = normalizePositiveInteger(pid);
  if (!safePid) {
    return '';
  }

  if (process.platform === 'linux') {
    const procPath = `/proc/${safePid}/cmdline`;
    if (fs.existsSync(procPath)) {
      try {
        return fs.readFileSync(procPath).toString().replace(/\u0000/g, ' ').trim();
      } catch {
        return '';
      }
    }
  }

  if (process.platform === 'win32') {
    const result = spawnSync(
      'powershell',
      [
        '-NoProfile',
        '-Command',
        `(Get-CimInstance Win32_Process -Filter "ProcessId = ${safePid}").CommandLine`,
      ],
      {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      }
    );
    return trimString(result.stdout || '');
  }

  const result = spawnSync('ps', ['-o', 'command=', '-p', String(safePid)], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return trimString(result.stdout || '');
}

export function matchesPersonaRuntimeCommand(commandLine, options = {}) {
  const text = trimString(commandLine);
  if (!text) {
    return false;
  }

  const workspacePath = trimString(options.workspacePath);
  const command = trimString(options.expectedCommand?.command);
  const args = Array.isArray(options.expectedCommand?.args) ? options.expectedCommand.args : [];
  const firstArg = trimString(args[0]);
  const localPort = normalizePositiveInteger(options.localPort);

  if (firstArg && !text.includes(firstArg)) {
    return false;
  }

  if (workspacePath && !text.includes(workspacePath)) {
    return false;
  }

  if (localPort) {
    const strictPortArg = `--port ${localPort}`;
    if (!text.includes(strictPortArg) && !text.includes(`:${localPort}`)) {
      return false;
    }
  }

  if (command) {
    const commandBase = path.basename(command);
    if (!text.includes(command) && !text.includes(commandBase)) {
      return false;
    }
  }

  return true;
}

function resolveDirectViteCommand({ workspacePath, localPort }) {
  if (!workspacePath) {
    return null;
  }

  const viteScriptPath = path.join(workspacePath, 'node_modules', 'vite', 'bin', 'vite.js');
  if (!fs.existsSync(viteScriptPath)) {
    return null;
  }

  const port = normalizePositiveInteger(localPort);
  const args = [viteScriptPath, '--host', resolvePersonaBindHost()];
  if (port) {
    args.push('--port', String(port), '--strictPort');
  }

  return {
    command: process.execPath,
    args,
  };
}

function wait(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function runProcess({ command, args, cwd }) {
  return new Promise((resolve, reject) => {
    const child =
      process.platform === 'win32'
        ? spawn(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', buildWindowsCommandLine(command, args)], {
            cwd,
            stdio: 'inherit',
            shell: false,
            windowsHide: true,
          })
        : spawn(command, args, {
            cwd,
            stdio: 'inherit',
            shell: false,
            windowsHide: true,
          });

    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${command} ${args.join(' ')} failed with exit code ${code ?? 'unknown'}.`));
    });
  });
}

export async function installPersonaWorkspace({
  workspacePath,
}) {
  if (!workspacePath) {
    throw new Error('Workspace path is required.');
  }

  syncVendoredWebSpatialPackages({ workspacePath });
  syncLegacyWebSpatialScaffoldFiles({ workspacePath });

  await runProcess({
    command: resolveNpmCommand(),
    args: ['install', '--silent', '--no-fund', '--no-audit'],
    cwd: workspacePath,
  });
}

export function resolvePersonaDevCommand({
  workspacePath,
  localPort,
}) {
  const directCommand = resolveDirectViteCommand({ workspacePath, localPort });
  if (directCommand) {
    return directCommand;
  }

  const port = normalizePositiveInteger(localPort);
  const args = ['run', 'dev'];
  if (port) {
    args.push('--', '--host', resolvePersonaBindHost(), '--port', String(port), '--strictPort');
  }
  return {
    command: resolveNpmCommand(),
    args,
  };
}

export function resolvePersonaDevEnvironment({
  workspacePath,
} = {}) {
  const runtimeConfig = readPersonaRuntimeConfig(workspacePath);
  const renderMode = trimString(runtimeConfig?.renderMode).toLowerCase();
  if (renderMode === 'webspatial') {
    return {
      XR_ENV: 'avp',
    };
  }

  return {};
}

export function resolvePersonaHealthPath({
  workspacePath,
  fallback = '/oomi.health.json',
} = {}) {
  const runtimeConfig = readPersonaRuntimeConfig(workspacePath);
  return normalizePersonaHealthPath(
    trimString(runtimeConfig?.healthPath) || fallback,
    runtimeConfig,
  );
}

export function startPersonaWorkspace({
  workspacePath,
  logFilePath,
  env = {},
  localPort,
}) {
  if (!workspacePath) {
    throw new Error('Workspace path is required.');
  }

  const resolvedLogFilePath =
    logFilePath ||
    path.join(workspacePath, '.oomi', 'runtime.log');
  ensureDir(path.dirname(resolvedLogFilePath));

  const output = fs.openSync(resolvedLogFilePath, 'a');
  const devCommand = resolvePersonaDevCommand({ workspacePath, localPort });
  const needsWindowsShellWrapper =
    process.platform === 'win32' && /\.cmd$/iu.test(path.basename(devCommand.command));

  if (needsWindowsShellWrapper) {
    fs.closeSync(output);
    const shellCommand = `${buildWindowsCommandLine(
      devCommand.command,
      devCommand.args
    )} >> "${resolvedLogFilePath.replace(/"/g, '""')}" 2>&1`;
    const child = spawn(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', shellCommand], {
      cwd: workspacePath,
      detached: true,
      stdio: 'ignore',
      shell: false,
      windowsHide: true,
      env: {
        ...process.env,
        ...resolvePersonaDevEnvironment({ workspacePath }),
        ...env,
      },
    });

    child.unref();

    const pid = normalizePositiveInteger(child.pid);
    if (!pid) {
      throw new Error('Failed to determine persona workspace process id on Windows.');
    }

    return {
      pid,
      logFilePath: resolvedLogFilePath,
    };
  }

  let child;
  try {
    child = spawn(devCommand.command, devCommand.args, {
      cwd: workspacePath,
      detached: true,
      stdio: ['ignore', output, output],
      shell: false,
      windowsHide: true,
      env: {
        ...process.env,
        ...resolvePersonaDevEnvironment({ workspacePath }),
        ...env,
      },
    });
  } finally {
    fs.closeSync(output);
  }

  child.unref();

  return {
    pid: child.pid,
    logFilePath: resolvedLogFilePath,
  };
}

export function isPersonaWorkspaceProcessRunning(pid, options = {}) {
  const safePid = normalizePositiveInteger(pid);
  if (!safePid) {
    return false;
  }

  try {
    process.kill(safePid, 0);
    const hasExpectations =
      trimString(options.workspacePath) ||
      trimString(options.expectedCommand?.command) ||
      normalizePositiveInteger(options.localPort);
    if (!hasExpectations) {
      return true;
    }

    const commandLine = readProcessCommandLine(safePid);
    return matchesPersonaRuntimeCommand(commandLine, options);

    return true;
  } catch {
    return false;
  }
}

export async function stopPersonaWorkspace({
  pid,
  waitMs = 4000,
}) {
  const safePid = normalizePositiveInteger(pid);
  if (!safePid || !isPersonaWorkspaceProcessRunning(safePid)) {
    return false;
  }

  try {
    process.kill(safePid, 'SIGTERM');
  } catch {
    return false;
  }

  const startedAt = Date.now();
  while (Date.now() - startedAt <= waitMs) {
    if (!isPersonaWorkspaceProcessRunning(safePid)) {
      return true;
    }
    await wait(200);
  }

  try {
    process.kill(safePid, 'SIGKILL');
  } catch {
    return !isPersonaWorkspaceProcessRunning(safePid);
  }

  return !isPersonaWorkspaceProcessRunning(safePid);
}

async function fetchHealth(url) {
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`Healthcheck returned ${response.status}.`);
  }

  return response;
}

export async function waitForPersonaRuntime({
  healthcheckUrl,
  timeoutMs = 45000,
  intervalMs = 1000,
}) {
  if (!healthcheckUrl) {
    throw new Error('Healthcheck URL is required.');
  }

  const startedAt = Date.now();
  let lastError = null;
  while (Date.now() - startedAt <= timeoutMs) {
    try {
      await fetchHealth(healthcheckUrl);
      return;
    } catch (error) {
      lastError = error;
      await wait(intervalMs);
    }
  }

  const message =
    lastError instanceof Error
      ? lastError.message
      : 'Timed out waiting for persona runtime healthcheck.';
  throw new Error(`Timed out waiting for persona runtime healthcheck: ${message}`);
}

export function buildLocalPersonaRuntime({
  localPort,
  healthPath,
}) {
  const port = Number(localPort);
  if (!Number.isFinite(port) || port <= 0) {
    throw new Error('Local port is required.');
  }

  const bindHost = resolvePersonaBindHost();
  const reachableHost = resolvePersonaReachableHost({ bindHost });
  const endpoint = `http://127.0.0.1:${port}`;
  const reachableEndpoint = `http://${formatPersonaRuntimeHostForUrl(reachableHost)}:${port}`;
  const normalizedHealthPath = healthPath || '/oomi.health.json';
  return {
    transport: 'local',
    endpoint,
    reachableEndpoint,
    bindHost,
    reachableHost,
    localPort: port,
    healthcheckUrl: `${endpoint}${normalizedHealthPath}`,
  };
}

export function defaultPersonaWorkspaceRoot() {
  return resolveOpenclawPersonasDir();
}
