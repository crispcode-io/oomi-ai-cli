# Oomi OpenClaw Operator Guide

Use these instructions when you need to connect, repair, or verify an OpenClaw machine that should talk to Oomi.

This is the packaged agent-facing reference for:
- managed OpenClaw connect and repair flows
- device-backed chat and voice bridge recovery
- XR-first persona generation and persona runtime repair

## Primary Goal

Get OpenClaw into a state where:
- Oomi managed text chat works
- Oomi device-backed voice can start cleanly
- the bridge is supervised or restartable
- the user never has to paste raw pair identifiers or gateway secrets manually when managed connect is available

## Standard Connect Flow

If the user asks to connect OpenClaw to Oomi chat or voice:

1. Refresh bootstrap first:
   - `curl -fsSL https://www.oomi.ai/install.sh | bash`
2. Ensure `oomi-ai` is installed:
   - `pnpm add -g oomi-ai@latest`
   - fallback: `npm install -g oomi-ai@latest`
3. Pair the device without starting a legacy one-off flow:
   - `oomi openclaw pair --app-url https://www.oomi.ai --no-start`
4. Install the OpenClaw plugin:
   - `openclaw plugins install oomi-ai@latest`
5. Print the config block and secrets:
   - `oomi openclaw plugin --show-secrets --backend-url https://api.oomi.ai`
6. Apply the printed `channels.oomi.accounts.default` config.
7. Restart OpenClaw.
8. Start or repair the bridge:
   - `oomi openclaw bridge ensure --detach`
   - if stale: `oomi openclaw bridge restart --detach`
   - on macOS, prefer supervision: `oomi openclaw bridge service install`

If the user provides a specific app URL, use it directly in the pair flow:
- `oomi openclaw pair --app-url <URL> --no-start`

## Required User-Facing Result

When pairing completes successfully, return this exact format:
- `Oomi Connect Ready`
- `Auth Link: ...`

Do not add extra narrative before or after those lines.
Do not ask the user to enter raw pair codes, gateway passwords, or nonce values manually.

## Runtime Checks

Use these commands to inspect the installed machine:

```bash
oomi openclaw bridge ps
oomi openclaw bridge service status
oomi openclaw status
tail -f ~/.openclaw/logs/oomi-bridge-live.log
tail -f ~/.openclaw/logs/gateway.log
tail -f ~/.openclaw/logs/gateway.err.log
```

Useful local files:
- `~/.openclaw/oomi-bridge-status.json`
- `~/.openclaw/logs/oomi-bridge-live.log`
- `~/.openclaw/logs/gateway.log`
- `~/.openclaw/logs/gateway.err.log`
- `~/.openclaw/agents/main/sessions/*.jsonl`

## Healthy State

Treat the machine as healthy when all of the following are true:
- OpenClaw loads the `oomi-ai` plugin without duplicate-id conflicts
- `channels.oomi.accounts.default` is populated with a valid `backendUrl` and `deviceToken`
- the bridge shows `connected` after managed subscription is confirmed
- text chat reaches the Oomi assistant
- voice STT can produce `asr.final`
- assistant replies can come back without the bridge dropping into `stopped`

Bridge status meanings:
- `starting`: bridge booting or waiting for managed subscription
- `connected`: ready for managed chat and voice traffic
- `reconnecting`: transport dropped and retry is scheduled
- `degraded`: bridge caught a runtime fault but is still alive
- `error`: startup/auth failure blocked useful operation
- `stopped`: not running or intentionally stopped

## Troubleshooting

### Duplicate plugin id warning

Symptom:
- OpenClaw reports `duplicate plugin id detected`

Action:
- ensure only one active `oomi-ai` plugin install is discoverable
- remove stale extension copies before reinstalling

### `invalid handshake: first request must be connect`

Meaning:
- a gateway request was sent before `connect` had been accepted

Action:
- update `oomi-ai`
- restart the bridge
- confirm only one bridge worker is running

### Device is linked but voice start still fails

Meaning:
- linked ownership is not enough; the device side still needs to be live

Action:
- confirm the device websocket is actually online
- confirm the bridge is `connected`
- restart the bridge if it is stuck in `reconnecting` or `degraded`

### STT works but the assistant does not reply

Meaning:
- the voice turn likely reached Oomi, but the managed gateway or OpenClaw run failed later

Action:
- inspect `gateway.log`, `gateway.err.log`, and the session JSONL
- check for `network_error`, auth failures, or repeated bridge restarts

### Bridge keeps restarting with `reason: stopped`

Action:
- confirm the newest `oomi-ai` is installed
- inspect `~/.openclaw/logs/oomi-bridge-live.log` for runtime exceptions
- use supervised mode on macOS: `oomi openclaw bridge service install`
- if the process is alive but faulted, expect `degraded` rather than an immediate hard stop on newer bridge builds

## Voice Notes

Voice depends on the same Oomi plugin and bridge layer as managed chat.
That means:
- if plugin install or bridge health is wrong, voice replies will also fail
- STT can succeed even when assistant reply delivery is broken later in the run
- a `voice_session_*` failure should be investigated, but it should not automatically be treated as proof that all normal Oomi chat is down

### Hidden Speech Payload

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
- for managed cloned-voice replies, include `metadata.spoken` whenever backend TTS should speak the turn
- `metadata.spoken.text` is for backend TTS only
- `metadata.spoken.language` should be one of the supported Qwen language values such as `English`
- `metadata.spoken.segments` can carry bounded per-segment prosody for pace, pitch, volume, and pause timing
- `metadata.spoken.instructions` should be natural-language guidance, not raw bracket tags
- `metadata.spoken.style` is optional metadata for debugging/future mapping

Current package behavior:
- if you provide `metadata.spoken`, the package preserves it unchanged
- if you omit `metadata.spoken`, the shared package helper may synthesize it as a compatibility guardrail before backend TTS
- visible chat text is never rewritten by the package
- backend cloned voice is strict: if `metadata.spoken` does not reach Oomi, playback fails instead of falling back to flat speech

## Avatar Commands

Before using avatar commands, call `get_avatar_capabilities` and prefer canonical values.
Inline tags are stripped from user-visible text.

Use inline tags like:
- `[anim:Waving]`, `[anim:Walking]`, `[anim:Idle]`, `[anim:Sitting Idle]`
- `[face:happy]`, `[face:sad]`, `[face:surprised]`, `[face:focused]`, `[face:gentle]`, `[face:thinking]`
- `[gesture:nod]`, `[gesture:think]`, `[gesture:shrug]`, `[gesture:wave]`, `[gesture:bow]`
- `[look:camera]`, `[look:left]`, `[look:right]`, `[look:up]`, `[look:down]`

Aliases allowed if needed:
- `wave -> Waving`
- `walk -> Walking`
- `idle -> Idle`
- `sit` or `sitting -> Sitting Idle`

## Persona App Generation

For persona app work, treat the scaffold as a runtime contract, not a disposable starting point.

When a user asks you in chat to create a new persona for Oomi:

1. First clarify the persona `name`, `slug`, `description`, permissions, tools, and the ideal work surface.
2. After that, use this exact manual creation order on the OpenClaw machine:
   - `export WORKSPACE_ROOT="$HOME/.openclaw/workspace/personas"`
   - `export SLUG="<persona-slug>"`
   - `export NAME="<persona-name>"`
   - `export DESCRIPTION="<persona-description>"`
   - `oomi personas scaffold "$SLUG" --name "$NAME" --description "$DESCRIPTION" --out "$WORKSPACE_ROOT/$SLUG" --force`
   - `test -f "$WORKSPACE_ROOT/$SLUG/persona.json"`
   - `test -f "$WORKSPACE_ROOT/$SLUG/oomi.runtime.json"`
   - `test -f "$WORKSPACE_ROOT/$SLUG/package.json"`
   - `oomi personas create-managed "$SLUG" --name "$NAME" --description "$DESCRIPTION" --json`
   - `oomi personas launch-managed "$SLUG" --workspace-root "$WORKSPACE_ROOT" --force-install --json`
   - `test -f "$WORKSPACE_ROOT/$SLUG/.oomi/runtime.json"`
   - `cat "$WORKSPACE_ROOT/$SLUG/.oomi/runtime.json"`
   - `oomi personas status "$SLUG" --json`
   - `PORT="$(jq -r '.localPort' "$WORKSPACE_ROOT/$SLUG/.oomi/runtime.json")"`
   - `oomi personas heartbeat "$SLUG" --local-port "$PORT" --json`
3. Fail fast if scaffold verification fails or if any `--json` command does not return success.
4. Treat backend registration as incomplete until `create-managed`, `launch-managed`, `status`, and `heartbeat` all succeed.
5. Do not present a localhost URL like `http://127.0.0.1:4789` as the final persona runtime URL for Oomi clients.
6. Do not rely on `launch-managed` auto-creating the backend persona record. Run `create-managed` explicitly first.
7. Do not use `oomi personas runtime-register <slug>` or `oomi personas heartbeat <slug>` before `create-managed` succeeds.
8. Do not use manual `npm run dev` or any unmanaged dev server as the persona launch path.

When generating a managed persona app for Oomi:

1. Do not build the app shell from scratch.
2. Always run `oomi personas scaffold <slug> --name "<name>" --description "<description>" --out <path>` first.
3. Only customize persona-specific files inside `src/persona/` and `persona/` unless Oomi explicitly instructs otherwise.
4. Preserve the scaffolded WebSpatial/Vite shell, `public/oomi.health.json`, `oomi.runtime.json`, `public/manifest.webmanifest`, and the vendored WebSpatial fork.
5. Keep the browser route and the XR route split. In XR mode, the index route should open directly into the mounted scene component, not a flat homepage.
6. Call `configurePersonaScene()` from that mounted scene component and log `detectSpatialEnvironment()` on scene boot so the runtime can be verified in headset.
7. Author multiple meaningful XR surfaces with `enable-xr`, `--xr-back`, and `--xr-background-material` values instead of putting one outer `enable-xr` wrapper around the whole page.
8. Keep `html.is-spatial` shell styles transparent so the host recedes and the authored panels carry the spatial material.
9. Keep `snapdom` and `html2canvas` exposed from `main.tsx` because AndroidXR DOM capture depends on them.
10. After customization, bring the persona online through `oomi personas launch-managed <slug> --workspace-root <root> --force-install --json`, then verify `oomi personas status <slug> --json`, then heartbeat using the assigned local port from `.oomi/runtime.json`.
11. For normal OpenClaw-hosted persona apps on the same LAN, the managed runtime registration contract is:
   - backend `entryUrl`: LAN-reachable host such as `http://192.168.x.x:<port>`
   - backend `healthcheckUrl`: local loopback such as `http://127.0.0.1:<port>/webspatial/avp/oomi.health.json`
12. Do not override `--endpoint` with `127.0.0.1` unless the persona is intentionally local-only and not meant to open from Oomi web/XR.
13. Do not replace the managed runtime flow with manual `npm run dev`, ad hoc `runtime-register`, or ad hoc `heartbeat` commands during first-time creation.

When editing an existing managed persona that is already open in Oomi:

1. Do not ask the user to find the app path manually if Oomi already selected the persona tab for you.
2. First run `oomi personas status <slug> --json`.
3. Use `editableWorkspacePath` from that command as the authoritative directory for reads, edits, and verification.
4. Treat `compatibilityWorkspacePath` only as a fallback or migration clue.
5. Preserve the scaffolded WebSpatial shell and runtime health files unless the user explicitly asks for a deeper structural change, and do not regress the XR route back into a flat home page.
6. Do not claim the persona changed unless you have verified the file contents changed in `editableWorkspacePath` or the runtime reflects the update.

When executing a structured persona job from Oomi:

1. Prefer `oomi persona-jobs execute --message-file <job.json>` when the backend has already produced a machine-readable job payload.
2. That command is allowed to scaffold the app, install dependencies, start the local runtime, wait for the health document, register the runtime, and report job success or failure.
3. Use the lower-level commands only for recovery or partial reruns:
   - `oomi personas runtime-register <slug> --local-port 4789`
   - `oomi personas heartbeat <slug> --local-port 4789`
   - `oomi persona-jobs start <jobId>`
   - `oomi persona-jobs succeed <jobId> --workspace-path <path> --local-port 4789`
   - `oomi persona-jobs fail <jobId> --code <code> --message "<text>"`
4. Before any low-level `runtime-register` or `heartbeat` recovery command, make sure the backend persona already exists via `create-managed`.
5. If you use the low-level `runtime-register` or `heartbeat` commands, prefer `--local-port` by itself and let `oomi-ai` derive the LAN-reachable endpoint automatically.
6. If you must pass `--endpoint` explicitly, it must be the LAN-reachable host or a relay URL, not `127.0.0.1`.

When the Oomi bridge is running on the machine, queued persona jobs from Oomi are now polled and executed automatically through the filtered control-message lane. You should still use the explicit commands above for manual retries, recovery, or direct operator workflows.
