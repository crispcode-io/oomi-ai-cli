import fs from 'node:fs';
import path from 'node:path';
import { generateKeyPairSync } from 'node:crypto';

const OPENCLAW_PROFILE_VERSION = 1;
const DEFAULT_PROFILE_PRESET = 'oomi-dev-local';
const DEFAULT_SESSION_KEY = 'agent:main:webchat:channel:oomi';
const DEFAULT_GATEWAY_PORT = 18789;
const DEFAULT_PLUGIN_TRUST_MODE = 'auto-discovery';
const DEFAULT_MODEL_AUTH_MODE = 'oomi-managed';

function trimString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function readJsonSafe(filePath, fallback = {}) {
  if (!fs.existsSync(filePath)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJson(filePath, value) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2) + '\n', 'utf8');
}

function normalizeBoolean(value, fallback = false) {
  if (typeof value === 'boolean') return value;
  const normalized = trimString(value).toLowerCase();
  if (!normalized) return fallback;
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return fallback;
}

function normalizePositiveInteger(value, fallback) {
  const numeric = Number.parseInt(String(value || ''), 10);
  if (!Number.isFinite(numeric) || numeric <= 0) return fallback;
  return numeric;
}

function sanitizeProfileId(value) {
  const normalized = trimString(value)
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return normalized || DEFAULT_PROFILE_PRESET;
}

function normalizePluginTrustMode(value) {
  return trimString(value) === 'plugins.allow' ? 'plugins.allow' : DEFAULT_PLUGIN_TRUST_MODE;
}

function normalizeModelAuthMode(value) {
  return trimString(value) === 'provider-env' ? 'provider-env' : DEFAULT_MODEL_AUTH_MODE;
}

function resolveConfigPath(openclawHome, explicitPath = '') {
  const targetPath = trimString(explicitPath);
  if (targetPath) return path.resolve(targetPath);

  const candidates = [
    path.join(openclawHome, 'clawdbot.json'),
    path.join(openclawHome, 'openclaw.json'),
  ];
  const existing = candidates.find((candidate) => fs.existsSync(candidate));
  return existing || candidates[1];
}

function ensureDeviceIdentity(identityPath, deviceId) {
  if (!trimString(deviceId) || fs.existsSync(identityPath)) return false;
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  writeJson(identityPath, {
    version: 1,
    deviceId,
    publicKeyPem: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
    privateKeyPem: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
  });
  return true;
}

function clearPluginAllowList(config) {
  const nextConfig = { ...(config || {}) };
  const plugins = typeof nextConfig.plugins === 'object' && nextConfig.plugins ? { ...nextConfig.plugins } : {};
  if (Object.prototype.hasOwnProperty.call(plugins, 'allow')) {
    delete plugins.allow;
  }
  nextConfig.plugins = plugins;
  return nextConfig;
}

function ensurePluginAllowList(config) {
  const nextConfig = { ...(config || {}) };
  const plugins = typeof nextConfig.plugins === 'object' && nextConfig.plugins ? { ...nextConfig.plugins } : {};
  plugins.allow = ['oomi-ai'];
  nextConfig.plugins = plugins;
  return nextConfig;
}

function applyGatewayConfig(config, gateway) {
  const nextConfig = { ...(config || {}) };
  const nextGateway = typeof nextConfig.gateway === 'object' && nextConfig.gateway ? { ...nextConfig.gateway } : {};
  nextGateway.port = normalizePositiveInteger(gateway?.port, DEFAULT_GATEWAY_PORT);
  nextGateway.mode = trimString(gateway?.mode) || 'local';
  nextGateway.bind = trimString(gateway?.bind) || 'loopback';
  nextGateway.auth = {
    mode: trimString(gateway?.auth?.mode) || 'token',
    token: trimString(gateway?.auth?.token),
  };
  nextGateway.tailscale = {
    mode: 'off',
    resetOnExit: false,
  };
  nextConfig.gateway = nextGateway;
  return nextConfig;
}

function applyOomiChannelConfig(config, oomiChannel) {
  const nextConfig = { ...(config || {}) };
  const channels = typeof nextConfig.channels === 'object' && nextConfig.channels ? { ...nextConfig.channels } : {};
  const oomi = typeof channels.oomi === 'object' && channels.oomi ? { ...channels.oomi } : {};
  const accounts = typeof oomi.accounts === 'object' && oomi.accounts ? { ...oomi.accounts } : {};
  const defaultAccount = typeof accounts.default === 'object' && accounts.default ? { ...accounts.default } : {};

  accounts.default = {
    enabled: true,
    requestTimeoutMs: normalizePositiveInteger(oomiChannel?.requestTimeoutMs, 15000),
    ...defaultAccount,
    backendUrl: trimString(oomiChannel?.backendUrl),
    deviceToken: trimString(oomiChannel?.deviceToken),
    defaultSessionKey: trimString(oomiChannel?.defaultSessionKey) || DEFAULT_SESSION_KEY,
  };

  oomi.defaultAccountId = 'default';
  oomi.accounts = accounts;
  channels.oomi = oomi;
  nextConfig.channels = channels;
  return nextConfig;
}

function removeOomiChannelConfig(config) {
  const nextConfig = { ...(config || {}) };
  const channels =
    typeof nextConfig.channels === 'object' && nextConfig.channels ? { ...nextConfig.channels } : {};
  if (Object.prototype.hasOwnProperty.call(channels, 'oomi')) {
    delete channels.oomi;
  }
  if (Object.keys(channels).length > 0) {
    nextConfig.channels = channels;
  } else if (Object.prototype.hasOwnProperty.call(nextConfig, 'channels')) {
    delete nextConfig.channels;
  }
  return nextConfig;
}

export function buildOomiDevLocalProfile(options = {}) {
  const profileId = sanitizeProfileId(options.profileId || options.id || DEFAULT_PROFILE_PRESET);
  const pluginTrustMode = normalizePluginTrustMode(options.pluginTrustMode);
  const enableOomiChannel = normalizeBoolean(options.enableOomiChannel, Boolean(trimString(options.deviceToken)));
  const modelAuthMode = normalizeModelAuthMode(options.modelAuthMode);

  return {
    version: OPENCLAW_PROFILE_VERSION,
    preset: DEFAULT_PROFILE_PRESET,
    profileId,
    label: trimString(options.label) || 'Oomi Local Dev',
    workspace: {
      root: trimString(options.workspaceRoot),
    },
    device: {
      id: trimString(options.deviceId),
    },
    gateway: {
      port: normalizePositiveInteger(options.gatewayPort, DEFAULT_GATEWAY_PORT),
      mode: 'local',
      bind: 'loopback',
      auth: {
        mode: 'token',
        token: trimString(options.gatewayToken),
      },
    },
    oomiChannel: {
      enabled: enableOomiChannel,
      backendUrl: trimString(options.backendUrl),
      deviceToken: trimString(options.deviceToken),
      defaultSessionKey: trimString(options.defaultSessionKey) || DEFAULT_SESSION_KEY,
      requestTimeoutMs: normalizePositiveInteger(options.requestTimeoutMs, 15000),
      pluginTrustMode,
    },
    model: {
      preset: trimString(options.modelPreset || 'openrouter-free'),
      authMode: modelAuthMode,
    },
  };
}

export function readOpenclawProfile(filePath) {
  const profilePath = path.resolve(filePath);
  return readJsonSafe(profilePath, null);
}

export function writeOpenclawProfile(filePath, profile) {
  const profilePath = path.resolve(filePath);
  writeJson(profilePath, profile);
  return profilePath;
}

export function applyOpenclawProfile({
  profile,
  openclawHome,
  configPath = '',
  identityPath = '',
  ensureIdentity = true,
} = {}) {
  if (!profile || typeof profile !== 'object') {
    throw new Error('OpenClaw profile is required.');
  }

  const homeRoot = path.resolve(trimString(openclawHome) || process.cwd());
  const resolvedConfigPath = resolveConfigPath(homeRoot, configPath);
  const resolvedIdentityPath = path.resolve(
    trimString(identityPath) || path.join(homeRoot, 'identity', 'device.json')
  );

  let nextConfig = readJsonSafe(resolvedConfigPath, {});
  nextConfig = applyGatewayConfig(nextConfig, profile.gateway);

  const pluginTrustMode = normalizePluginTrustMode(profile?.oomiChannel?.pluginTrustMode);
  nextConfig =
    pluginTrustMode === 'plugins.allow'
      ? ensurePluginAllowList(nextConfig)
      : clearPluginAllowList(nextConfig);

  if (normalizeBoolean(profile?.oomiChannel?.enabled, false)) {
    nextConfig = applyOomiChannelConfig(nextConfig, profile.oomiChannel);
  } else {
    nextConfig = removeOomiChannelConfig(nextConfig);
  }

  writeJson(resolvedConfigPath, nextConfig);

  const identityCreated =
    ensureIdentity && trimString(profile?.device?.id)
      ? ensureDeviceIdentity(resolvedIdentityPath, profile.device.id)
      : false;

  return {
    ok: true,
    profileId: sanitizeProfileId(profile.profileId),
    preset: trimString(profile.preset) || DEFAULT_PROFILE_PRESET,
    configPath: resolvedConfigPath,
    identityPath: resolvedIdentityPath,
    openclawHome: homeRoot,
    pluginTrustMode,
    oomiChannelEnabled: normalizeBoolean(profile?.oomiChannel?.enabled, false),
    identityCreated,
  };
}
