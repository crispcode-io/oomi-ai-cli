# Oomi Avatar Control

Before using avatar commands, call `get_avatar_capabilities` and prefer canonical values.
Inline tags are stripped from user-visible text.

Use inline tags like:
- [anim:Waving], [anim:Walking], [anim:Idle], [anim:Sitting Idle]
- [face:happy], [face:sad], [face:surprised], [face:focused], [face:gentle], [face:thinking]
- [gesture:nod], [gesture:think], [gesture:shrug], [gesture:wave], [gesture:bow]
- [look:camera], [look:left], [look:right], [look:up], [look:down]

Aliases allowed (if needed): wave -> Waving, walk -> Walking, idle -> Idle, sit/sitting -> Sitting Idle

## Oomi Connect Flow

If the user asks to connect OpenClaw to Oomi voice/web:

1. Refresh bootstrap/update first:
   - `curl -fsSL https://www.oomi.ai/install.sh | bash`
2. Ensure `oomi-ai` is installed (`pnpm add -g oomi-ai@latest`).
   - Fallback: `npm install -g oomi-ai@latest`
3. Pair device token without starting legacy bridge:
   - `oomi openclaw pair --app-url https://www.oomi.ai --no-start`
4. Install OpenClaw plugin:
   - `openclaw plugins install oomi-ai@latest`
5. Configure channel account (`channels.oomi.accounts.default`) from:
   - `oomi openclaw plugin --show-secrets --backend-url https://api.oomi.ai`
6. Restart OpenClaw.
7. Ensure exactly one bridge worker is running (singleton handler):
   - `oomi openclaw bridge ensure --detach`
   - If stale/disconnected: `oomi openclaw bridge restart --detach`
   - On macOS, prefer supervised mode: `oomi openclaw bridge service install`
8. If user provides an app URL (for example "Connect yourself to Oomi. Use app URL <URL>."):
   - Use that URL directly in the pair command.
   - Example: `oomi openclaw pair --app-url <URL> --no-start`
9. Return this exact result format to the user:
   - `Oomi Connect Ready`
   - `Auth Link: ...`
   - No extra narrative text before or after those lines.

Primary UX requirement:
- Never ask the user to enter raw pairing identifiers.
- The user should open the auth link, complete sign-in, and land directly in connected chat.
- Return `/connect/<invite-token>` auth links only.

Do not ask users to paste gateway IP/token/password when managed connect is available.

## Hidden Speech Payload

For managed voice turns, keep visible assistant chat text natural and user-facing.
Do not put spoken-style tags like `[happy]`, `[sad]`, or `[excited]` into visible chat text.

When the runtime supports it, voice turns may include a hidden speech sidecar on the assistant message:

```json
{
  "metadata": {
    "spoken": {
      "text": "Speech-optimized text for TTS only.",
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
- visible `content` remains the source of truth for Oomi chat rendering
- for managed voice replies, include `metadata.spoken` when delivery benefits from cleaner phrasing or explicit speaking guidance
- `metadata.spoken.text` is for backend TTS only
- `metadata.spoken.language` should be one of the supported Qwen language values such as `English`
- `metadata.spoken.segments` can carry bounded per-segment prosody for pace, pitch, volume, and pause timing
- `metadata.spoken.instructions` should be natural-language guidance, not raw bracket tags
- `metadata.spoken.style` is optional metadata for debugging or future mapping
- if no hidden speech sidecar exists, Oomi falls back to speaking the visible assistant text
- if you omit `metadata.spoken`, the plugin now synthesizes a bounded hidden fallback from visible assistant text
- visible chat text is never rewritten by the plugin
