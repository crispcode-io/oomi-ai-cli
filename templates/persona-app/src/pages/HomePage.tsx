import { Link } from "react-router-dom";
import "../App.css";
import { personaConfig } from "../persona/config";
import { personaNotes } from "../persona/notes";
import {
  WEBSPATIAL_FORK_COMMIT,
  detectSpatialEnvironment,
  openPersonaScene,
} from "../spatial";

const browserCards = [
  {
    title: "Browser route stays valid",
    body: "Keep a normal web route for previews, fallback browsers, and non-spatial editing.",
  },
  {
    title: "XR route stays separate",
    body: "The mounted scene component should own scene bootstrap, diagnostics, and the real spatial surfaces.",
  },
  {
    title: "Oomi opens the entry URL",
    body: "When the runtime is spatial, the entry route should land directly in the scene instead of a flat homepage.",
  },
];

export function HomePage() {
  const environment = detectSpatialEnvironment();

  return (
    <main className="persona-home">
      <section className="home-grid">
        <article className="home-panel home-hero">
          <div>
            <p className="home-eyebrow">Oomi Persona Surface</p>
            <h1 className="home-title">{personaConfig.name}</h1>
            <p className="home-description">{personaConfig.description}</p>
            <p className="home-supporting-copy">
              This browser route exists for non-spatial parity. In XR mode, the index route should
              open directly into the mounted scene so Oomi lands on a real WebSpatial workspace
              instead of another 2D page.
            </p>
          </div>

          <div className="home-actions">
            <button className="home-primary-button" onClick={openPersonaScene}>
              Launch XR Workspace
            </button>
            <Link className="home-secondary-link" to="/scene" target="_blank" rel="noreferrer">
              Open Scene Route
            </Link>
          </div>

          <div className="home-card-grid">
            {browserCards.map(card => (
              <article key={card.title} className="home-panel home-feature-card">
                <h2>{card.title}</h2>
                <p>{card.body}</p>
              </article>
            ))}
          </div>
        </article>

        <aside className="home-panel home-runtime">
          <p className="home-eyebrow">Runtime Snapshot</p>
          <div className="home-runtime-list">
            <div className="home-runtime-row">
              <span>Slug</span>
              <span>{personaConfig.slug}</span>
            </div>
            <div className="home-runtime-row">
              <span>SDK</span>
              <span>@webspatial/react-sdk {environment.sdkVersion}</span>
            </div>
            <div className="home-runtime-row">
              <span>Bridge</span>
              <span>{environment.hasBridge ? "available" : "waiting"}</span>
            </div>
            <div className="home-runtime-row">
              <span>Native</span>
              <span>{environment.nativeVersion ?? "browser fallback"}</span>
            </div>
            <div className="home-runtime-row">
              <span>Fork</span>
              <span>{WEBSPATIAL_FORK_COMMIT.slice(0, 7)}</span>
            </div>
            <div className="home-runtime-row">
              <span>Spatial mode</span>
              <span>{environment.isWebSpatial ? "active" : "not active"}</span>
            </div>
          </div>
        </aside>
      </section>

      <section className="home-card-grid">
        <article className="home-panel home-copy-card">
          <h2>Template Contract</h2>
          <p>
            XR mode should default into <code>ScenePage</code>, mount scene bootstrap from that
            component, and render multiple authored panels with explicit depth and material.
          </p>
          <p>
            The scaffold should teach agents to build surfaces, not just pages wrapped in one
            captured DOM card.
          </p>
        </article>

        <article className="home-panel home-copy-card">
          <h2>Editing Notes</h2>
          <ul className="home-note-list">
            {personaNotes.map(note => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        </article>

        <article className="home-panel home-copy-card">
          <h2>Spatial Defaults</h2>
          <p>
            Preserve the transparent spatial shell, the vendored WebSpatial fork, and the DOM
            capture hooks in <code>main.tsx</code>. Those pieces are part of the runtime contract,
            not optional polish.
          </p>
        </article>
      </section>
    </main>
  );
}
