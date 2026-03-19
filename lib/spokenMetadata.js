function trimString(value, fallback = '') {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

const ELLIPSIS_PLACEHOLDER = '__OOMI_ELLIPSIS__';

function stripAvatarCommandTags(text) {
  return text.replace(/\[(anim|animation|face|expression|emotion|gesture|look|gaze):[^\]]+\]/gi, ' ');
}

function clampInteger(value, fallback, { min = 1, max = Number.MAX_SAFE_INTEGER } = {}) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  const normalized = Math.floor(value);
  if (normalized < min) return fallback;
  if (normalized > max) return max;
  return normalized;
}

const BOUNDED_LANGUAGE_TYPES = new Set([
  'Auto',
  'Chinese',
  'English',
  'German',
  'Italian',
  'Portuguese',
  'Spanish',
  'Japanese',
  'Korean',
  'French',
  'Russian',
]);

const BOUNDED_PACE_VALUES = new Set(['very_slow', 'slow', 'medium', 'medium_fast', 'fast']);
const BOUNDED_PITCH_VALUES = new Set(['low', 'slightly_low', 'neutral', 'slightly_high', 'high']);
const BOUNDED_ENERGY_VALUES = new Set(['soft', 'calm', 'warm', 'bright', 'intense']);
const BOUNDED_VOLUME_VALUES = new Set(['soft', 'normal', 'projected']);

function inferSpokenLanguage(text) {
  const normalized = trimString(text);
  if (!normalized) return 'English';
  return 'English';
}

function normalizeSpokenSegment(segment) {
  if (!segment || typeof segment !== 'object' || Array.isArray(segment)) return null;

  const text = normalizeSpeechText(trimString(segment.text));
  if (!text) return null;

  const normalized = { text };
  const pace = trimString(segment.pace);
  const pitch = trimString(segment.pitch);
  const energy = trimString(segment.energy);
  const volume = trimString(segment.volume);
  const pauseAfterMs = clampInteger(segment.pause_after_ms, 0, { min: 0, max: 1200 });

  if (BOUNDED_PACE_VALUES.has(pace)) normalized.pace = pace;
  if (BOUNDED_PITCH_VALUES.has(pitch)) normalized.pitch = pitch;
  if (BOUNDED_ENERGY_VALUES.has(energy)) normalized.energy = energy;
  if (BOUNDED_VOLUME_VALUES.has(volume)) normalized.volume = volume;
  normalized.pause_after_ms = pauseAfterMs;

  return normalized;
}

function stripEmoji(text) {
  return text.replace(/[\uFE0E\uFE0F]/g, '').replace(/\p{Extended_Pictographic}|\p{Emoji_Presentation}/gu, '');
}

function normalizeSpeechText(text) {
  return stripEmoji(stripAvatarCommandTags(text))
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/__(.*?)__/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/[\u2013\u2014]/g, ', ')
    .replace(/\u2026/g, ELLIPSIS_PLACEHOLDER)
    .replace(/\.{3,}/g, ELLIPSIS_PLACEHOLDER)
    .replace(/\s+/g, ' ')
    .replace(/\s+([,.;!?])/g, '$1')
    .replace(/([,;!?])(?=[^\s])/g, '$1 ')
    .replace(/(\.)(?=[^\s.])/g, '$1 ')
    .replace(/,\s*,+/g, ', ')
    .replace(new RegExp(`${ELLIPSIS_PLACEHOLDER}(?=[^\\s,.;!?])`, 'g'), `${ELLIPSIS_PLACEHOLDER} `)
    .replace(new RegExp(ELLIPSIS_PLACEHOLDER, 'g'), '...')
    .replace(/\s+/g, ' ')
    .trim();
}

function splitSpeechSegments(text) {
  const normalized = normalizeSpeechText(text);
  if (!normalized) return [];

  const baseSegments = normalized
    .split(/(?<=[.!?])\s+|\n+/)
    .map((segment) => segment.trim())
    .filter(Boolean);

  const segments = [];
  for (const segment of baseSegments) {
    if (segment.length <= 96) {
      segments.push(segment);
      continue;
    }

    const clauseParts = segment
      .split(/(?<=[,;:])\s+/)
      .map((part) => part.trim())
      .filter(Boolean);

    if (clauseParts.length > 1) {
      for (const part of clauseParts) {
        segments.push(part);
      }
      continue;
    }

    segments.push(segment);
  }

  if (segments.length <= 5) return segments;

  return [...segments.slice(0, 4), segments.slice(4).join(' ').trim()];
}

function inferSegmentStyle(segmentText, index, totalSegments) {
  const normalized = segmentText.toLowerCase();
  const greeting = /^(hey|hi|hello|yo)\b/.test(normalized);
  const exclamatory = /!/.test(segmentText) || /\b(hell yeah|awesome|amazing|stoked|love|perfect|great)\b/.test(normalized);
  const curious = /\?/.test(segmentText);
  const reassuring = /\b(got it|no worries|all good|you'?re good|sounds good|totally|absolutely)\b/.test(normalized);
  const reflective =
    /\b(i think|i'm|i am|i've|i have|lately|right now|before this|each time|understand|it feels like)\b/.test(normalized) ||
    segmentText.length > 60;

  if (greeting || reassuring) {
    return {
      pace: 'medium_fast',
      pitch: 'slightly_high',
      energy: 'bright',
      volume: 'projected',
      pause_after_ms: index < totalSegments - 1 ? 180 : 0,
    };
  }

  if (curious) {
    return {
      pace: 'medium',
      pitch: 'slightly_high',
      energy: 'warm',
      volume: 'projected',
      pause_after_ms: 0,
    };
  }

  if (exclamatory) {
    return {
      pace: 'medium_fast',
      pitch: 'slightly_high',
      energy: 'bright',
      volume: 'projected',
      pause_after_ms: index < totalSegments - 1 ? 220 : 0,
    };
  }

  if (reflective) {
    return {
      pace: 'slow',
      pitch: 'slightly_low',
      energy: 'warm',
      volume: 'soft',
      pause_after_ms: index < totalSegments - 1 ? 280 : 0,
    };
  }

  return {
    pace: 'medium',
    pitch: 'slightly_high',
    energy: 'warm',
    volume: 'normal',
    pause_after_ms: index < totalSegments - 1 ? 180 : 0,
  };
}

function synthesizeSpokenSegments(text) {
  const language = inferSpokenLanguage(text);
  const rawSegments = splitSpeechSegments(text);
  if (rawSegments.length === 0) return null;

  const segments = rawSegments.map((segmentText, index) => ({
    text: segmentText,
    ...inferSegmentStyle(segmentText, index, rawSegments.length),
  }));

  return {
    language,
    segments,
  };
}

function normalizeSpokenMetadata(spoken) {
  if (!spoken || typeof spoken !== 'object' || Array.isArray(spoken)) return null;

  const text = normalizeSpeechText(trimString(spoken.text));
  if (!text) return null;

  const normalized = { text };
  const language = trimString(spoken.language);
  if (BOUNDED_LANGUAGE_TYPES.has(language)) {
    normalized.language = language;
  }

  const explicitSegments =
    Array.isArray(spoken.segments)
      ? spoken.segments.map((segment) => normalizeSpokenSegment(segment)).filter(Boolean)
      : [];
  if (explicitSegments.length > 0) {
    normalized.segments = explicitSegments;
  }

  const instructions = trimString(spoken.instructions);
  if (instructions) normalized.instructions = instructions;
  if (spoken.style && typeof spoken.style === 'object' && !Array.isArray(spoken.style)) {
    normalized.style = spoken.style;
  }

  const fallbackSegments = synthesizeSpokenSegments(text);
  if (!normalized.language && fallbackSegments?.language) {
    normalized.language = fallbackSegments.language;
  }
  if (!normalized.segments && fallbackSegments?.segments?.length) {
    normalized.segments = fallbackSegments.segments;
  }

  return normalized;
}

function inferSpokenMetadataFromContent(content) {
  const text = normalizeSpeechText(trimString(content));
  if (!text) return null;
  const synthesized = synthesizeSpokenSegments(text);

  const normalized = text.toLowerCase();
  const upbeat =
    /!/.test(text) ||
    /\b(hell yeah|awesome|amazing|great|stoked|love|glad|perfect|nice|cool)\b/.test(normalized);
  const gentle =
    /\b(sorry|gentle|softly|careful|reassuring|calm|okay|it'?s okay|i know)\b/.test(normalized);
  const curious = /\?/.test(text);

  if (upbeat) {
    return normalizeSpokenMetadata({
      text,
      language: synthesized?.language || 'English',
      segments: synthesized?.segments,
      instructions: 'Speak with warm, upbeat conversational energy and natural pacing.',
      style: { emotion: 'upbeat', energy: 'medium' },
    });
  }

  if (gentle) {
    return normalizeSpokenMetadata({
      text,
      language: synthesized?.language || 'English',
      segments: synthesized?.segments,
      instructions: 'Speak gently and reassuringly, with a calm pace and soft emphasis.',
      style: { emotion: 'gentle', energy: 'low' },
    });
  }

  if (curious) {
    return normalizeSpokenMetadata({
      text,
      language: synthesized?.language || 'English',
      segments: synthesized?.segments,
      instructions: 'Speak naturally with curious, engaged intonation and a conversational pace.',
      style: { emotion: 'curious', energy: 'medium' },
    });
  }

  return normalizeSpokenMetadata({
    text,
    language: synthesized?.language || 'English',
    segments: synthesized?.segments,
    instructions: 'Speak naturally with light warmth and conversational pacing.',
    style: { emotion: 'neutral', energy: 'medium' },
  });
}

export {
  inferSpokenMetadataFromContent,
  normalizeSpokenMetadata,
  normalizeSpeechText,
  stripAvatarCommandTags,
};
