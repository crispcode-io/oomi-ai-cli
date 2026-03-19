---
name: oomi
description: Support Oomi OpenClaw installs, bridge health, managed chat and voice setup, and avatar control.
---

# Oomi Skill

Use this skill when you need to:
- connect an OpenClaw machine to Oomi
- repair the Oomi plugin or bridge on a machine
- inspect managed chat or voice health
- control the Oomi avatar with inline tags

## Primary Operator Workflow

If the user wants OpenClaw connected to Oomi:

1. Ensure `oomi-ai` is installed or updated:
```bash
pnpm add -g oomi-ai@latest
```
Fallback:
```bash
npm install -g oomi-ai@latest
```

2. Pair the device:
```bash
oomi openclaw pair --app-url https://www.oomi.ai --no-start
```

3. Install the plugin:
```bash
openclaw plugins install oomi-ai@latest
```

4. Print config guidance:
```bash
oomi openclaw plugin --show-secrets --backend-url https://api.oomi.ai
```

5. Apply the `channels.oomi.accounts.default` config and restart OpenClaw.

6. Start or repair the bridge:
```bash
oomi openclaw bridge ensure --detach
```
If stale:
```bash
oomi openclaw bridge restart --detach
```
On macOS, prefer supervised mode:
```bash
oomi openclaw bridge service install
```

## Health Checks

Use these when chat or voice is failing:

```bash
oomi openclaw bridge ps
oomi openclaw bridge service status
oomi openclaw status
tail -f ~/.openclaw/logs/oomi-bridge-live.log
tail -f ~/.openclaw/logs/gateway.log
tail -f ~/.openclaw/logs/gateway.err.log
```

Interpret bridge states like this:
- `starting`: booting or waiting for managed subscription
- `connected`: ready for managed traffic
- `reconnecting`: retry scheduled after transport failure
- `degraded`: bridge caught a runtime fault but is still alive
- `error`: startup or auth failure blocked operation
- `stopped`: not running or intentionally shut down

## Common Failures

### Duplicate plugin id
- Cause: multiple discoverable `oomi-ai` installs
- Action: remove stale plugin copies and reinstall once

### `invalid handshake: first request must be connect`
- Cause: gateway request ordering broke
- Action: update `oomi-ai`, restart the bridge, confirm only one bridge worker exists

### STT works but the assistant does not reply
- Cause: the voice turn reached Oomi, but the managed gateway or OpenClaw run failed later
- Action: inspect `gateway.log`, `gateway.err.log`, and the session JSONL for that run

## Local Oomi API Tools

These scripts interact with the local Oomi application when it is running.

### `get_data`
Fetch the latest user activity data.

```bash
python3 skills/oomi/scripts/get_data.py
```

### `set_goal`
Set a new goal in the local Oomi app.

```bash
python3 skills/oomi/scripts/send_goal.py --type "steps" --value 10000 --message "Let's hit 10k today!"
```

### `sync`
Sync local context.

```bash
python3 skills/oomi/scripts/sync.py
```

### `get_avatar_capabilities`
Read the avatar command schema before emitting inline avatar tags.

```bash
python3 skills/oomi/scripts/get_avatar_capabilities.py
```

### `install_agent_instructions`
Install packaged Oomi operator instructions into an OpenClaw `AGENTS.md` file.

```bash
python3 skills/oomi/scripts/install_agent_instructions.py
```

## Hidden Speech Payload

Managed voice can carry a hidden TTS-only speech sidecar alongside the normal assistant message.

Use this shape when a voice turn needs more natural delivery without changing visible chat text:

```json
{
  "metadata": {
    "spoken": {
      "text": "Speech-optimized text for TTS only.",
      "language": "English",
      "segments": [
        {
          "text": "Hey! It's Nemu, but close enough.",
          "pace": "medium_fast",
          "pitch": "slightly_high",
          "energy": "bright",
          "volume": "normal",
          "pause_after_ms": 220
        },
        {
          "text": "Right now, I'm just waking up into this conversation with you.",
          "pace": "medium",
          "pitch": "neutral",
          "energy": "warm",
          "volume": "normal",
          "pause_after_ms": 280
        }
      ],
      "instructions": "Speak with upbeat, warm excitement and slightly rising intonation.",
      "style": {
        "emotion": "excited",
        "energy": "medium_high"
      }
    }
  }
}
```

Rules:
- keep visible assistant `content` clean and user-facing
- do not place raw intonation tags in visible chat
- for managed cloned-voice replies, include `metadata.spoken` when backend TTS should speak the turn
- `metadata.spoken.text` is backend TTS input only
- `metadata.spoken.language` should be one of the supported Qwen language values such as `English`
- `metadata.spoken.segments` can carry bounded per-segment prosody for pace, pitch, volume, and pause timing
- `metadata.spoken.instructions` should use natural-language speaking guidance
- if you omit `metadata.spoken`, the shared package helper may synthesize it as a compatibility guardrail before backend TTS
- backend cloned voice is strict: if `metadata.spoken` does not reach Oomi, playback fails instead of falling back to flat speech

## Avatar Control

Before emitting avatar commands, call `get_avatar_capabilities` and prefer canonical values.
Use aliases only when explicitly needed.

Supported inline tags include:
- animations: `[anim:Waving]`, `[anim:Walking]`, `[anim:Idle]`, `[anim:Sitting Idle]`
- expressions: `[face:happy]`, `[face:sad]`, `[face:surprised]`, `[face:focused]`, `[face:gentle]`, `[face:thinking]`
- gestures: `[gesture:nod]`, `[gesture:think]`, `[gesture:shrug]`, `[gesture:wave]`, `[gesture:bow]`
- gaze: `[look:camera]`, `[look:left]`, `[look:right]`, `[look:up]`, `[look:down]`
