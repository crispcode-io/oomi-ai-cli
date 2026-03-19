export const personaNotes = [
  "Keep persona-specific logic inside src/persona/ unless Oomi explicitly instructs otherwise.",
  "Preserve the WebSpatial router basename, and default the index route to ScenePage whenever the runtime is running under the XR base path.",
  "Call configurePersonaScene() from the mounted scene component and log detectSpatialEnvironment() when the scene boots.",
  "Keep using the vendored AndroidXR-enabled WebSpatial fork instead of switching back to the stock npm packages.",
  "Author multiple meaningful surfaces with explicit enable-xr, --xr-back, and --xr-background-material values so the app reads as spatial instead of one captured webpage.",
  "Keep html.is-spatial shell styles transparent so the host recedes and the panels carry the visual material.",
  "Keep the managed runtime compatible with `oomi personas launch-managed`; do not require manual npm run dev for Oomi to consider the persona live.",
  "Do not remove public/oomi.runtime.json, public/oomi.health.json, or public/manifest.webmanifest.",
];
