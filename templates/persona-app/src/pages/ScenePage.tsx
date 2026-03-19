import { useEffect } from "react";
import { Link } from "react-router-dom";
import "../App.css";
import { personaConfig } from "../persona/config";
import { personaNotes } from "../persona/notes";
import {
  WEBSPATIAL_FORK_COMMIT,
  configurePersonaScene,
  detectSpatialEnvironment,
  xrStyle,
} from "../spatial";

const spatialWorkflows = [
  {
    title: "Primary workspace panel",
    body: "Use this as the main operator surface for the persona's task instead of duplicating a generic homepage.",
  },
  {
    title: "Secondary workspace panel",
    body: "Reserve a separate surface for supporting context, previews, or step-by-step controls so the XR scene reads as a composed environment.",
  },
];

const sceneChips = [
  "header surface",
  "workspace panel",
  "status panel",
  "completion panel",
  "tool tray",
];

export function ScenePage() {
  const environment = detectSpatialEnvironment();

  useEffect(() => {
    configurePersonaScene();

    const snapshot = detectSpatialEnvironment();
    console.info("[persona] spatial runtime", snapshot);
  }, []);

  return (
    <main className="scene-shell">
      <header className="scene-header" enable-xr style={xrStyle(14, "thin")}>
        <div>
          <p className="scene-eyebrow">Spatial Scene</p>
          <h1 className="scene-title">{personaConfig.name}</h1>
          <p className="scene-copy">
            {personaConfig.description} This route is the default experience when Oomi opens the
            app inside the WebSpatial runtime, so it should behave like a real XR workspace instead
            of a browser homepage.
          </p>
        </div>

        <div className="scene-badge-stack">
          <span className="scene-badge">{environment.isWebSpatial ? "WebSpatial active" : "Browser preview"}</span>
          <span className="scene-badge">SDK {environment.sdkVersion}</span>
          <span className="scene-badge">Fork {WEBSPATIAL_FORK_COMMIT.slice(0, 7)}</span>
        </div>
      </header>

      <section className="scene-workspace-grid">
        <article className="scene-surface scene-workspace-primary" enable-xr style={xrStyle(40, "thick")}>
          <p className="scene-surface-label">Primary Workspace</p>
          <h2 className="scene-surface-title">Make spatial panels the default, not the afterthought</h2>
          <p className="scene-copy">
            The mounted scene component is where the persona should bootstrap the scene, verify the
            runtime, and lay out the main work surfaces. If the scene route only wraps a normal
            home page, the app will still feel flat in-headset even when the SDK is bundled.
          </p>

          <div className="scene-step-grid">
            {spatialWorkflows.map(workflow => (
              <article key={workflow.title} className="scene-step-card">
                <h3>{workflow.title}</h3>
                <p>{workflow.body}</p>
              </article>
            ))}
          </div>
        </article>

        <div className="scene-secondary-stack">
          <aside className="scene-surface" enable-xr style={xrStyle(24, "thin")}>
            <p className="scene-surface-label">Runtime Diagnostics</p>
            <div className="scene-status-grid">
              <div className="scene-status-row">
                <span>isWebSpatial</span>
                <span>{environment.isWebSpatial ? "true" : "false"}</span>
              </div>
              <div className="scene-status-row">
                <span>hasBridge</span>
                <span>{environment.hasBridge ? "true" : "false"}</span>
              </div>
              <div className="scene-status-row">
                <span>hasWebSpatialData</span>
                <span>{environment.hasWebSpatialData ? "true" : "false"}</span>
              </div>
              <div className="scene-status-row">
                <span>nativeVersion</span>
                <span>{environment.nativeVersion ?? "browser fallback"}</span>
              </div>
            </div>
          </aside>

          <aside className="scene-surface" enable-xr style={xrStyle(18, "thin")}>
            <p className="scene-surface-label">Tool Tray</p>
            <div className="scene-chip-row">
              {sceneChips.map(chip => (
                <span key={chip} className="scene-tool-chip">
                  {chip}
                </span>
              ))}
            </div>
          </aside>
        </div>
      </section>

      <section className="scene-support-grid">
        <article className="scene-surface" enable-xr style={xrStyle(18, "thin")}>
          <p className="scene-surface-label">Spatial Surface Checklist</p>
          <h2 className="scene-surface-title">At least three authored panels</h2>
          <p className="scene-copy">
            Add <code>enable-xr</code> and <code>xrStyle()</code> to meaningful panels like the
            scene header, the primary workspace, and supporting status or completion surfaces.
          </p>
        </article>

        <article className="scene-surface" enable-xr style={xrStyle(28, "regular")}>
          <p className="scene-surface-label">Completion Panel</p>
          <h2 className="scene-surface-title">Keep the host transparent</h2>
          <p className="scene-copy">
            The XR shell should recede behind the panels. Use <code>html.is-spatial</code> styles
            so the host background stays transparent while the authored panels carry material.
          </p>
        </article>

        <article className="scene-surface" enable-xr style={xrStyle(22, "thin")}>
          <p className="scene-surface-label">Agent Notes</p>
          <ul className="scene-note-list">
            {personaNotes.map(note => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        </article>
      </section>

      <footer className="scene-footer">
        <p className="scene-footer-copy">
          Browser editing still lives at the non-spatial route while XR mode defaults directly into
          the scene.
        </p>
        <Link className="scene-link" to="/home">
          Open browser route
        </Link>
      </footer>
    </main>
  );
}
