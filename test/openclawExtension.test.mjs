import test from 'node:test';
import assert from 'node:assert/strict';

import register from '../openclaw.extension.js';

function loadPlugin() {
  let plugin = null;
  register({
    registerChannel: ({ plugin: next }) => {
      plugin = next;
    },
  });
  return plugin;
}

function baseConfig() {
  return {
    channels: {
      oomi: {
        defaultAccountId: 'default',
        accounts: {
          default: {
            backendUrl: 'https://api.oomi.ai',
            deviceToken: 'bridge-token',
            defaultSessionKey: 'agent:main:webchat:channel:oomi',
            requestTimeoutMs: 15000,
          },
        },
      },
    },
  };
}

function channelConfigOnly() {
  return {
    defaultAccountId: 'default',
    accounts: {
      default: {
        backendUrl: 'https://api.oomi.ai',
        deviceToken: 'bridge-token',
        defaultSessionKey: 'agent:main:webchat:channel:oomi',
        requestTimeoutMs: 15000,
      },
    },
  };
}

test('openclaw extension sendText forwards messageId + correlationId', async () => {
  const plugin = loadPlugin();
  assert.ok(plugin);

  const originalFetch = globalThis.fetch;
  let capturedBody = null;
  globalThis.fetch = async (_url, options) => {
    capturedBody = JSON.parse(options.body);
    return {
      ok: true,
      status: 200,
      json: async () => ({ message: { messageId: 'provider-msg-1' } }),
    };
  };

  try {
    const result = await plugin.outbound.sendText({
      cfg: baseConfig(),
      content: 'hello',
      userId: 'usr_1',
      conversationKey: 'conv_1',
      messageId: 'msg_1',
      correlationId: 'corr_1',
    });

    assert.equal(result.ok, true);
    assert.equal(result.providerMessageId, 'provider-msg-1');
    assert.equal(capturedBody.messageId, 'msg_1');
    assert.equal(capturedBody.correlationId, 'corr_1');
    assert.equal(capturedBody.metadata.correlationId, 'corr_1');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('openclaw extension accepts direct channel config shape', async () => {
  const plugin = loadPlugin();
  assert.ok(plugin);

  const originalFetch = globalThis.fetch;
  let capturedBody = null;
  globalThis.fetch = async (_url, options) => {
    capturedBody = JSON.parse(options.body);
    return {
      ok: true,
      status: 200,
      json: async () => ({ message: { messageId: 'provider-msg-2' } }),
    };
  };

  try {
    const result = await plugin.outbound.sendText({
      cfg: channelConfigOnly(),
      content: 'hello from direct config',
      userId: 'usr_1',
      conversationKey: 'conv_1',
      messageId: 'msg_2',
      correlationId: 'corr_2',
    });

    assert.equal(result.ok, true);
    assert.equal(result.providerMessageId, 'provider-msg-2');
    assert.equal(capturedBody.messageId, 'msg_2');
    assert.equal(capturedBody.correlationId, 'corr_2');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('openclaw extension surfaces backend errorCode for failed sends', async () => {
  const plugin = loadPlugin();
  assert.ok(plugin);

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: false,
    status: 409,
    json: async () => ({
      error: 'Managed device is offline.',
      errorCode: 'device_offline',
    }),
  });

  try {
    const result = await plugin.outbound.sendText({
      cfg: baseConfig(),
      content: 'hello',
      userId: 'usr_1',
      conversationKey: 'conv_1',
    });

    assert.equal(result.ok, false);
    assert.equal(result.code, 'device_offline');
    assert.match(result.error, /device_offline/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('openclaw extension forwards hidden spoken metadata without changing visible content', async () => {
  const plugin = loadPlugin();
  assert.ok(plugin);

  const originalFetch = globalThis.fetch;
  let capturedBody = null;
  globalThis.fetch = async (_url, options) => {
    capturedBody = JSON.parse(options.body);
    return {
      ok: true,
      status: 200,
      json: async () => ({ message: { messageId: 'provider-msg-3' } }),
    };
  };

  try {
    const result = await plugin.outbound.sendText({
      cfg: baseConfig(),
      content: 'Visible chat text stays the same.',
      userId: 'usr_1',
      conversationKey: 'conv_1',
      messageId: 'msg_3',
      correlationId: 'corr_3',
      metadata: {
        spoken: {
          text: 'Speech-only text with cleaner pauses.',
          language: 'English',
          segments: [
            {
              text: 'Speech-only text',
              pace: 'medium',
              pitch: 'neutral',
              energy: 'warm',
              volume: 'normal',
              pause_after_ms: 180,
            },
            {
              text: 'with cleaner pauses.',
              pace: 'slow',
              pitch: 'slightly_low',
              energy: 'calm',
              volume: 'soft',
              pause_after_ms: 0,
            },
          ],
          instructions: 'Speak warmly and naturally.',
          style: { emotion: 'warm', energy: 'medium' },
        },
      },
    });

    assert.equal(result.ok, true);
    assert.equal(capturedBody.content, 'Visible chat text stays the same.');
    assert.deepEqual(capturedBody.metadata.spoken, {
      text: 'Speech-only text with cleaner pauses.',
      language: 'English',
      segments: [
        {
          text: 'Speech-only text',
          pace: 'medium',
          pitch: 'neutral',
          energy: 'warm',
          volume: 'normal',
          pause_after_ms: 180,
        },
        {
          text: 'with cleaner pauses.',
          pace: 'slow',
          pitch: 'slightly_low',
          energy: 'calm',
          volume: 'soft',
          pause_after_ms: 0,
        },
      ],
      instructions: 'Speak warmly and naturally.',
      style: { emotion: 'warm', energy: 'medium' },
    });
    assert.equal(capturedBody.metadata.accountId, 'default');
    assert.equal(capturedBody.metadata.correlationId, 'corr_3');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('openclaw extension repairs malformed spoken metadata while preserving other metadata fields', async () => {
  const plugin = loadPlugin();
  assert.ok(plugin);

  const originalFetch = globalThis.fetch;
  let capturedBody = null;
  globalThis.fetch = async (_url, options) => {
    capturedBody = JSON.parse(options.body);
    return {
      ok: true,
      status: 200,
      json: async () => ({ message: { messageId: 'provider-msg-4' } }),
    };
  };

  try {
    const result = await plugin.outbound.sendText({
      cfg: baseConfig(),
      content: 'Visible chat text',
      userId: 'usr_1',
      conversationKey: 'conv_1',
      messageId: 'msg_4',
      metadata: {
        sourceHint: 'voice-turn',
        spoken: {
          text: '',
          instructions: 'Speak brightly.',
          style: 'not-an-object',
        },
      },
    });

    assert.equal(result.ok, true);
    assert.equal(capturedBody.metadata.sourceHint, 'voice-turn');
    assert.deepEqual(capturedBody.metadata.spoken, {
      text: 'Visible chat text',
      language: 'English',
      segments: [
        {
          text: 'Visible chat text',
          pace: 'medium',
          pitch: 'slightly_high',
          energy: 'warm',
          volume: 'normal',
          pause_after_ms: 0,
        },
      ],
      instructions: 'Speak naturally with light warmth and conversational pacing.',
      style: { emotion: 'neutral', energy: 'medium' },
    });
    assert.equal(capturedBody.metadata.accountId, 'default');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('openclaw extension preserves custom metadata while synthesizing hidden spoken metadata when absent', async () => {
  const plugin = loadPlugin();
  assert.ok(plugin);

  const originalFetch = globalThis.fetch;
  let capturedBody = null;
  globalThis.fetch = async (_url, options) => {
    capturedBody = JSON.parse(options.body);
    return {
      ok: true,
      status: 200,
      json: async () => ({ message: { messageId: 'provider-msg-5' } }),
    };
  };

  try {
    const result = await plugin.outbound.sendText({
      cfg: baseConfig(),
      content: 'Plain text message',
      userId: 'usr_1',
      conversationKey: 'conv_1',
      messageId: 'msg_5',
      metadata: {
        customFlag: true,
      },
    });

    assert.equal(result.ok, true);
    assert.equal(capturedBody.metadata.customFlag, true);
    assert.deepEqual(capturedBody.metadata.spoken, {
      text: 'Plain text message',
      language: 'English',
      segments: [
        {
          text: 'Plain text message',
          pace: 'medium',
          pitch: 'slightly_high',
          energy: 'warm',
          volume: 'normal',
          pause_after_ms: 0,
        },
      ],
      instructions: 'Speak naturally with light warmth and conversational pacing.',
      style: { emotion: 'neutral', energy: 'medium' },
    });
    assert.equal(capturedBody.content, 'Plain text message');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('openclaw extension synthesizes hidden spoken metadata when none is provided', async () => {
  const plugin = loadPlugin();
  assert.ok(plugin);

  const originalFetch = globalThis.fetch;
  let capturedBody = null;
  globalThis.fetch = async (_url, options) => {
    capturedBody = JSON.parse(options.body);
    return {
      ok: true,
      status: 200,
      json: async () => ({ message: { messageId: 'provider-msg-6' } }),
    };
  };

  try {
    const result = await plugin.outbound.sendText({
      cfg: baseConfig(),
      content: "Hell yeah. When it all clicks like this, it feels like magic — but it's just good plumbing. Stoked it's working for you. 🎙️✨",
      userId: 'usr_1',
      conversationKey: 'conv_1',
      messageId: 'msg_6',
      metadata: {
        sourceHint: 'voice-turn',
      },
    });

    assert.equal(result.ok, true);
    assert.equal(capturedBody.content, "Hell yeah. When it all clicks like this, it feels like magic — but it's just good plumbing. Stoked it's working for you. 🎙️✨");
    assert.deepEqual(capturedBody.metadata.spoken, {
      text: "Hell yeah. When it all clicks like this, it feels like magic, but it's just good plumbing. Stoked it's working for you.",
      language: 'English',
      segments: [
        {
          text: 'Hell yeah.',
          pace: 'medium_fast',
          pitch: 'slightly_high',
          energy: 'bright',
          volume: 'projected',
          pause_after_ms: 220,
        },
        {
          text: "When it all clicks like this, it feels like magic, but it's just good plumbing.",
          pace: 'slow',
          pitch: 'slightly_low',
          energy: 'warm',
          volume: 'soft',
          pause_after_ms: 280,
        },
        {
          text: "Stoked it's working for you.",
          pace: 'medium_fast',
          pitch: 'slightly_high',
          energy: 'bright',
          volume: 'projected',
          pause_after_ms: 0,
        },
      ],
      instructions: 'Speak with warm, upbeat conversational energy and natural pacing.',
      style: { emotion: 'upbeat', energy: 'medium' },
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('openclaw extension keeps avatar command tags in visible content but strips them from hidden spoken metadata', async () => {
  const plugin = loadPlugin();
  assert.ok(plugin);

  const originalFetch = globalThis.fetch;
  let capturedBody = null;
  globalThis.fetch = async (_url, options) => {
    capturedBody = JSON.parse(options.body);
    return {
      ok: true,
      status: 200,
      json: async () => ({ message: { messageId: 'provider-msg-6c' } }),
    };
  };

  try {
    const result = await plugin.outbound.sendText({
      cfg: baseConfig(),
      content: '[anim:wave] [face:happy] Hey Justin! How is the testing going?',
      userId: 'usr_1',
      conversationKey: 'conv_1',
      messageId: 'msg_6c',
      metadata: {
        sourceHint: 'voice-turn',
      },
    });

    assert.equal(result.ok, true);
    assert.equal(capturedBody.content, '[anim:wave] [face:happy] Hey Justin! How is the testing going?');
    assert.equal(capturedBody.metadata.spoken.text, 'Hey Justin! How is the testing going?');
    assert.deepEqual(
      capturedBody.metadata.spoken.segments.map((segment) => segment.text),
      ['Hey Justin!', 'How is the testing going?']
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('openclaw extension repairs invalid explicit spoken metadata by synthesizing a bounded fallback', async () => {
  const plugin = loadPlugin();
  assert.ok(plugin);

  const originalFetch = globalThis.fetch;
  let capturedBody = null;
  globalThis.fetch = async (_url, options) => {
    capturedBody = JSON.parse(options.body);
    return {
      ok: true,
      status: 200,
      json: async () => ({ message: { messageId: 'provider-msg-6b' } }),
    };
  };

  try {
    const result = await plugin.outbound.sendText({
      cfg: baseConfig(),
      content: 'Plain text message',
      userId: 'usr_1',
      conversationKey: 'conv_1',
      messageId: 'msg_6b',
      metadata: {
        spoken: null,
        sourceHint: 'voice-turn',
      },
    });

    assert.equal(result.ok, true);
    assert.equal(capturedBody.metadata.sourceHint, 'voice-turn');
    assert.deepEqual(capturedBody.metadata.spoken, {
      text: 'Plain text message',
      language: 'English',
      segments: [
        {
          text: 'Plain text message',
          pace: 'medium',
          pitch: 'slightly_high',
          energy: 'warm',
          volume: 'normal',
          pause_after_ms: 0,
        },
      ],
      instructions: 'Speak naturally with light warmth and conversational pacing.',
      style: { emotion: 'neutral', energy: 'medium' },
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('openclaw extension preserves explicit spoken metadata over synthesized fallback', async () => {
  const plugin = loadPlugin();
  assert.ok(plugin);

  const originalFetch = globalThis.fetch;
  let capturedBody = null;
  globalThis.fetch = async (_url, options) => {
    capturedBody = JSON.parse(options.body);
    return {
      ok: true,
      status: 200,
      json: async () => ({ message: { messageId: 'provider-msg-7' } }),
    };
  };

  try {
    const result = await plugin.outbound.sendText({
      cfg: baseConfig(),
      content: 'Visible text stays here.',
      userId: 'usr_1',
      conversationKey: 'conv_1',
      messageId: 'msg_7',
      metadata: {
        sourceHint: 'voice-turn',
        spoken: {
          text: 'Custom speech-only text.',
          instructions: 'Speak like a close friend.',
          style: { emotion: 'warm' },
        },
      },
    });

    assert.equal(result.ok, true);
    assert.deepEqual(capturedBody.metadata.spoken, {
      text: 'Custom speech-only text.',
      language: 'English',
      segments: [
        {
          text: 'Custom speech-only text.',
          pace: 'medium',
          pitch: 'slightly_high',
          energy: 'warm',
          volume: 'normal',
          pause_after_ms: 0,
        },
      ],
      instructions: 'Speak like a close friend.',
      style: { emotion: 'warm' },
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});
