import { inferSpokenMetadataFromContent, normalizeSpokenMetadata } from './lib/spokenMetadata.js';

const CHANNEL_ID = 'oomi';
const DEFAULT_SESSION_KEY = 'agent:main:webchat:channel:oomi';
const DEFAULT_TIMEOUT_MS = 15000;

function toString(value, fallback = '') {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function toNumber(value, fallback, { min = 1, max = Number.MAX_SAFE_INTEGER } = {}) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  const normalized = Math.floor(value);
  if (normalized < min) return fallback;
  if (normalized > max) return max;
  return normalized;
}

function parseAccounts(rawAccounts) {
  if (!rawAccounts || typeof rawAccounts !== 'object') return {};
  const accounts = {};

  for (const [accountId, raw] of Object.entries(rawAccounts)) {
    if (!raw || typeof raw !== 'object') continue;
    accounts[accountId] = {
      enabled: raw.enabled !== false,
      backendUrl: toString(raw.backendUrl),
      deviceToken: toString(raw.deviceToken),
      defaultSessionKey: toString(raw.defaultSessionKey, DEFAULT_SESSION_KEY),
      requestTimeoutMs: toNumber(raw.requestTimeoutMs, DEFAULT_TIMEOUT_MS, { min: 2000, max: 120000 }),
    };
  }

  return accounts;
}

function extractChannelConfig(cfg = {}) {
  if (!cfg || typeof cfg !== 'object') return {};
  if (cfg.channels && typeof cfg.channels === 'object' && cfg.channels[CHANNEL_ID] && typeof cfg.channels[CHANNEL_ID] === 'object') {
    return cfg.channels[CHANNEL_ID];
  }
  if (cfg[CHANNEL_ID] && typeof cfg[CHANNEL_ID] === 'object') {
    return cfg[CHANNEL_ID];
  }
  if (cfg.accounts && typeof cfg.accounts === 'object') {
    return cfg;
  }
  return {};
}

function normalizeConfig(cfg = {}) {
  const channelConfig = extractChannelConfig(cfg);
  const configuredAccounts = parseAccounts(channelConfig.accounts);
  const accountIds = Object.keys(configuredAccounts);
  const defaultAccountId = toString(channelConfig.defaultAccountId, accountIds[0] || 'default');

  if (!configuredAccounts[defaultAccountId]) {
    configuredAccounts[defaultAccountId] = {
      enabled: true,
      backendUrl: '',
      deviceToken: '',
      defaultSessionKey: DEFAULT_SESSION_KEY,
      requestTimeoutMs: DEFAULT_TIMEOUT_MS,
    };
  }

  return {
    defaultAccountId,
    accounts: configuredAccounts,
  };
}

function resolveAccount(cfg, accountId) {
  const normalized = normalizeConfig(cfg);
  const resolvedId = toString(accountId, normalized.defaultAccountId);
  const account = normalized.accounts[resolvedId];
  if (!account) {
    return {
      accountId: resolvedId,
      account: null,
    };
  }

  return {
    accountId: resolvedId,
    account,
  };
}

function extractText(payload) {
  if (!payload) return '';
  if (typeof payload === 'string') return payload.trim();

  const direct = [payload.text, payload.message, payload.content, payload.body];
  for (const value of direct) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }

  if (Array.isArray(payload.content)) {
    return payload.content
      .filter((part) => part && typeof part === 'object' && part.type === 'text' && typeof part.text === 'string')
      .map((part) => part.text.trim())
      .filter(Boolean)
      .join('\n');
  }

  return '';
}

function extractConversationKey(payload) {
  const candidates = [
    payload?.conversationKey,
    payload?.threadId,
    payload?.target?.conversationKey,
    payload?.target?.threadId,
    payload?.target?.id,
    payload?.metadata?.conversationKey,
    payload?.metadata?.threadId,
  ];

  for (const candidate of candidates) {
    const value = toString(candidate);
    if (value) return value;
  }

  return '';
}

function extractUserId(payload) {
  const candidates = [
    payload?.userId,
    payload?.target?.userId,
    payload?.metadata?.userId,
  ];

  for (const candidate of candidates) {
    const value = toString(candidate);
    if (value) return value;
  }

  return '';
}

function nextMessageId() {
  return `oomi_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function extractMessageId(payload) {
  const candidates = [
    payload?.messageId,
    payload?.id,
    payload?.requestId,
    payload?.idempotencyKey,
    payload?.metadata?.messageId,
    payload?.metadata?.idempotencyKey,
  ];

  for (const candidate of candidates) {
    const value = toString(candidate);
    if (value) return value;
  }

  return nextMessageId();
}

function extractCorrelationId(payload) {
  const candidates = [
    payload?.correlationId,
    payload?.metadata?.correlationId,
    payload?.requestId,
    payload?.messageId,
    payload?.id,
  ];

  for (const candidate of candidates) {
    const value = toString(candidate);
    if (value) return value;
  }

  return '';
}

function normalizeOutgoingMetadata(payloadMetadata, { accountId, correlationId, content }) {
  const metadata =
    payloadMetadata && typeof payloadMetadata === 'object' && !Array.isArray(payloadMetadata)
      ? { ...payloadMetadata }
      : {};

  const spoken =
    normalizeSpokenMetadata(metadata.spoken) ||
    inferSpokenMetadataFromContent(content);
  if (spoken) {
    metadata.spoken = spoken;
  } else {
    delete metadata.spoken;
  }

  metadata.accountId = accountId;
  if (correlationId) {
    metadata.correlationId = correlationId;
  } else {
    delete metadata.correlationId;
  }

  return metadata;
}

async function postJson({ url, token, body, timeoutMs }) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    const payload = await response.json().catch(() => ({}));
    return {
      ok: response.ok,
      status: response.status,
      payload,
    };
  } finally {
    clearTimeout(timeout);
  }
}

const oomiChannelPlugin = {
  id: CHANNEL_ID,
  meta: {
    label: 'Oomi',
    selectionLabel: 'Oomi (Managed)',
    docsPath: '/channels/oomi',
    docsLabel: 'oomi',
    blurb: 'Managed channel transport for Oomi chat.',
    aliases: ['oomi-ai'],
    description: 'Managed Oomi channel plugin.',
  },
  capabilities: {
    chatTypes: ['direct'],
    media: {
      images: false,
      audio: false,
      files: false,
    },
    threads: true,
  },

  config: {
    listAccountIds(cfg) {
      const normalized = normalizeConfig(cfg);
      return Object.entries(normalized.accounts)
        .filter(([, account]) => account.enabled !== false)
        .map(([accountId]) => accountId);
    },

    resolveAccount(cfg, accountId) {
      const { accountId: resolvedAccountId, account } = resolveAccount(cfg, accountId);
      if (!account) return null;
      return {
        id: resolvedAccountId,
        ...account,
      };
    },
  },

  outbound: {
    deliveryMode: 'direct',

    async sendText(payload = {}) {
      const { cfg, accountId } = payload;
      const { accountId: resolvedAccountId, account } = resolveAccount(cfg, accountId);

      if (!account || account.enabled === false) {
        return {
          ok: false,
          error: `oomi account is disabled or missing (${resolvedAccountId})`,
        };
      }
      if (!account.backendUrl || !account.deviceToken) {
        return {
          ok: false,
          error: `oomi account is missing backendUrl/deviceToken (${resolvedAccountId})`,
        };
      }

      const content = extractText(payload);
      if (!content) {
        return {
          ok: false,
          error: 'oomi outbound message content is empty',
        };
      }

      const conversationKey = extractConversationKey(payload);
      const userId = extractUserId(payload);
      const sessionKey = toString(payload?.sessionKey || payload?.metadata?.sessionKey, account.defaultSessionKey);
      const messageId = extractMessageId(payload);
      const correlationId = extractCorrelationId(payload);

      const response = await postJson({
        url: `${account.backendUrl}/v1/channel/plugin/messages`,
        token: account.deviceToken,
        timeoutMs: account.requestTimeoutMs,
        body: {
          messageId,
          correlationId,
          conversationKey,
          userId,
          sessionKey,
          content,
          source: 'openclaw.channel',
          metadata: normalizeOutgoingMetadata(payload?.metadata, {
            accountId: resolvedAccountId,
            correlationId,
            content,
          }),
        },
      });

      if (!response.ok) {
        const reason = toString(response.payload?.error, `status ${response.status}`);
        const code = toString(response.payload?.errorCode);
        return {
          ok: false,
          error: `oomi plugin message publish failed: ${reason}${code ? ` (code=${code})` : ''}`,
          code,
        };
      }

      return {
        ok: true,
        providerMessageId: toString(response.payload?.message?.messageId),
      };
    },
  },
};

export default function register(api) {
  api.registerChannel({ plugin: oomiChannelPlugin });
}
