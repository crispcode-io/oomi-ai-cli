# __OOMI_PERSONA_NAME__

This project was scaffolded by `oomi personas scaffold`.

## Purpose

This app is intended to run inside the Oomi client as a managed persona surface with an XR-first WebSpatial scaffold.

## Editable Zones

Only customize files in these zones unless Oomi explicitly changes the scaffold contract:

- `src/persona/`
- `persona/`

## XR Scaffold Contract

The scaffold is considered healthy only when all of the following stay true:

- the index route defaults to `ScenePage` in XR mode and keeps a valid browser route for non-spatial use
- `ScenePage` calls `configurePersonaScene()` on mount
- `ScenePage` logs `detectSpatialEnvironment()` so developers can verify the runtime is actually live
- multiple meaningful surfaces use `enable-xr` and `xrStyle()`
- `html.is-spatial` keeps the shell background transparent
- `src/main.tsx` still exposes `snapdom` and `html2canvas` on `window`
- the vendored WebSpatial fork metadata in `vendor/webspatial/FORK.md` stays intact

## Runtime Contract

- Template version: `__OOMI_TEMPLATE_VERSION__`
- Health document: `/oomi.health.json`
- Runtime metadata document: `/oomi.runtime.json`
- Manifest: `/manifest.webmanifest`
- Default dev port: `4789`

## Local Development

```bash
npm install
npm run dev:avp
```

## Managed Launch Contract

This scaffold is meant to be launched through the managed Oomi flow, not as an ad hoc dev server:

- scaffold the workspace with `oomi personas scaffold`
- create the backend record with `oomi personas create-managed`
- launch and register through `oomi personas launch-managed`
- verify `.oomi/runtime.json`, `oomi personas status --json`, and `oomi personas heartbeat --json`

Do not replace that flow with `npm run dev` when reporting persona creation success back to Oomi.

## Notes

- Preserve the WebSpatial/Vite shell, the runtime metadata files in `public/`, and the XR-specific route split between browser and scene modes.
- Treat the scene route as the real XR workspace, not as a flat homepage with one outer `enable-xr` wrapper.
- Customize persona behavior in `src/persona/`.
