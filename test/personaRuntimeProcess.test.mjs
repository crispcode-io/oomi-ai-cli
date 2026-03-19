import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  buildLocalPersonaRuntime,
  matchesPersonaRuntimeCommand,
  resolvePersonaDevCommand,
  resolvePersonaDevEnvironment,
  resolvePersonaHealthPath,
  resolvePersonaReachableHost,
  syncLegacyWebSpatialScaffoldFiles,
  syncVendoredWebSpatialPackages,
} from '../lib/personaRuntimeProcess.js';

function createTempWorkspace() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'oomi-persona-runtime-process-'));
}

function withEnv(overrides, fn) {
  const previous = {};
  for (const [key, value] of Object.entries(overrides)) {
    previous[key] = process.env[key];
    if (value == null) {
      delete process.env[key];
    } else {
      process.env[key] = String(value);
    }
  }

  try {
    return fn();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value == null) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

test('resolvePersonaDevCommand prefers direct vite execution when the workspace has vite installed', () => {
  const workspacePath = createTempWorkspace();
  const viteBinDir = path.join(workspacePath, 'node_modules', 'vite', 'bin');
  fs.mkdirSync(viteBinDir, { recursive: true });
  fs.writeFileSync(path.join(viteBinDir, 'vite.js'), 'console.log("vite");\n', 'utf8');

  const command = resolvePersonaDevCommand({
    workspacePath,
    localPort: 4891,
  });

  assert.equal(command.command, process.execPath);
  assert.deepEqual(command.args, [
    path.join(viteBinDir, 'vite.js'),
    '--host',
    '0.0.0.0',
    '--port',
    '4891',
    '--strictPort',
  ]);
});

test('resolvePersonaDevCommand falls back to npm-based dev command when vite is not installed locally', () => {
  const workspacePath = createTempWorkspace();

  const command = resolvePersonaDevCommand({
    workspacePath,
    localPort: 4892,
  });

  assert.equal(command.command, process.platform === 'win32' ? 'npm.cmd' : 'npm');
  assert.deepEqual(command.args, [
    'run',
    'dev',
    '--',
    '--host',
    '0.0.0.0',
    '--port',
    '4892',
    '--strictPort',
  ]);
});

test('resolvePersonaReachableHost prefers a real LAN address over virtual adapters', () => {
  const reachableHost = resolvePersonaReachableHost({
    bindHost: '0.0.0.0',
    env: {},
    networkInterfaces: {
      'vEthernet (WSL)': [
        { family: 'IPv4', internal: false, address: '172.18.16.1' },
      ],
      Ethernet: [
        { family: 'IPv4', internal: false, address: '192.168.50.161' },
      ],
    },
  });

  assert.equal(reachableHost, '192.168.50.161');
});

test('buildLocalPersonaRuntime keeps loopback healthchecks but publishes a LAN endpoint', () => {
  const runtime = withEnv(
    {
      OOMI_PERSONA_PUBLIC_HOST: '192.168.50.161',
      OOMI_PERSONA_BIND_HOST: '',
    },
    () => buildLocalPersonaRuntime({
      localPort: 4789,
      healthPath: '/oomi.health.json',
    }),
  );

  assert.equal(runtime.endpoint, 'http://127.0.0.1:4789');
  assert.equal(runtime.reachableEndpoint, 'http://192.168.50.161:4789');
  assert.equal(runtime.healthcheckUrl, 'http://127.0.0.1:4789/oomi.health.json');
});

test('resolvePersonaHealthPath prefixes webspatial runtimes with the avp base path', () => {
  const workspacePath = createTempWorkspace();
  fs.writeFileSync(
    path.join(workspacePath, 'oomi.runtime.json'),
    JSON.stringify({ renderMode: 'webspatial', healthPath: '/oomi.health.json' }, null, 2),
    'utf8',
  );

  assert.equal(
    resolvePersonaHealthPath({ workspacePath, fallback: '/oomi.health.json' }),
    '/webspatial/avp/oomi.health.json',
  );
});

test('resolvePersonaDevEnvironment enables avp mode for webspatial runtimes', () => {
  const workspacePath = createTempWorkspace();
  fs.writeFileSync(
    path.join(workspacePath, 'oomi.runtime.json'),
    JSON.stringify({ renderMode: 'webspatial' }, null, 2),
    'utf8',
  );

  assert.deepEqual(resolvePersonaDevEnvironment({ workspacePath }), {
    XR_ENV: 'avp',
  });
});

test('syncVendoredWebSpatialPackages rewrites webspatial runtimes to the vendored AndroidXR fork', () => {
  const workspacePath = createTempWorkspace();
  fs.writeFileSync(
    path.join(workspacePath, 'oomi.runtime.json'),
    JSON.stringify({ renderMode: 'webspatial' }, null, 2),
    'utf8',
  );
  fs.writeFileSync(
    path.join(workspacePath, 'package.json'),
    JSON.stringify(
      {
        name: 'persona-proof',
        dependencies: {
          '@webspatial/core-sdk': '^1.2.1',
          '@webspatial/react-sdk': '^1.2.1',
        },
        devDependencies: {
          '@webspatial/builder': '^0.1.16',
          '@webspatial/platform-visionos': '^0.1.16',
          '@webspatial/vite-plugin': '^0.1.7',
        },
      },
      null,
      2,
    ),
    'utf8',
  );

  const changed = syncVendoredWebSpatialPackages({ workspacePath });
  const packageJson = JSON.parse(fs.readFileSync(path.join(workspacePath, 'package.json'), 'utf8'));

  assert.equal(changed, true);
  assert.equal(packageJson.dependencies['@webspatial/core-sdk'], 'file:./vendor/webspatial/core-sdk');
  assert.equal(packageJson.dependencies['@webspatial/react-sdk'], 'file:./vendor/webspatial/react-sdk');
  assert.equal(packageJson.dependencies['@zumer/snapdom'], '^1.9.14');
  assert.equal(packageJson.dependencies['html2canvas'], '^1.4.1');
  assert.equal(packageJson.devDependencies['@webspatial/builder'], '^1.2.1');
  assert.equal(packageJson.devDependencies['@webspatial/platform-visionos'], '^1.2.1');
  assert.equal(packageJson.devDependencies['@webspatial/vite-plugin'], '^0.1.7');
  assert.ok(
    fs.existsSync(path.join(workspacePath, 'vendor', 'webspatial', 'react-sdk', 'dist', 'default', 'index.js')),
  );
  assert.ok(
    fs.existsSync(path.join(workspacePath, 'vendor', 'webspatial', 'core-sdk', 'dist', 'index.js')),
  );
});

test('syncVendoredWebSpatialPackages reports vendor drift so existing runtimes reinstall', () => {
  const workspacePath = createTempWorkspace();
  fs.writeFileSync(
    path.join(workspacePath, 'oomi.runtime.json'),
    JSON.stringify({ renderMode: 'webspatial' }, null, 2),
    'utf8',
  );
  fs.writeFileSync(
    path.join(workspacePath, 'package.json'),
    JSON.stringify(
      {
        name: 'persona-proof',
        dependencies: {
          '@webspatial/core-sdk': 'file:./vendor/webspatial/core-sdk',
          '@webspatial/react-sdk': 'file:./vendor/webspatial/react-sdk',
          '@zumer/snapdom': '^1.9.14',
          html2canvas: '^1.4.1',
        },
      },
      null,
      2,
    ),
    'utf8',
  );

  const firstSyncChanged = syncVendoredWebSpatialPackages({ workspacePath });
  assert.equal(firstSyncChanged, true);

  const vendorFilePath = path.join(
    workspacePath,
    'vendor',
    'webspatial',
    'react-sdk',
    'dist',
    'default',
    'index.js',
  );
  const originalVendorFile = fs.readFileSync(vendorFilePath, 'utf8');
  fs.writeFileSync(vendorFilePath, `${originalVendorFile}\n// drifted locally\n`, 'utf8');

  const secondSyncChanged = syncVendoredWebSpatialPackages({ workspacePath });
  assert.equal(secondSyncChanged, true);
  assert.equal(fs.readFileSync(vendorFilePath, 'utf8'), originalVendorFile);
});

test('syncLegacyWebSpatialScaffoldFiles upgrades legacy stock scene files to the AndroidXR scaffold', () => {
  const workspacePath = createTempWorkspace();
  fs.mkdirSync(path.join(workspacePath, 'src', 'pages'), { recursive: true });
  fs.mkdirSync(path.join(workspacePath, 'src', 'persona'), { recursive: true });
  fs.writeFileSync(
    path.join(workspacePath, 'oomi.runtime.json'),
    JSON.stringify({ renderMode: 'webspatial' }, null, 2),
    'utf8',
  );
  fs.writeFileSync(
    path.join(workspacePath, 'persona.json'),
    JSON.stringify(
      {
        id: 'chef-dev',
        name: 'Chef Dev',
        summary: 'Healthy dinner planner.',
        promptTemplateVersion: 'v1',
      },
      null,
      2,
    ),
    'utf8',
  );
  fs.writeFileSync(
    path.join(workspacePath, 'src', 'persona', 'config.ts'),
    [
      'export const personaConfig = {',
      '  slug: "chef-dev",',
      '  name: "Chef Dev",',
      '  description: "Healthy dinner planner.",',
      '  templateVersion: "v1",',
      '};',
      '',
    ].join('\n'),
    'utf8',
  );
  fs.writeFileSync(
    path.join(workspacePath, 'src', 'main.tsx'),
    [
      'import { StrictMode } from "react";',
      'import { createRoot } from "react-dom/client";',
      'import "./index.css";',
      'import App from "./App";',
      '',
      'createRoot(document.getElementById("root")!).render(',
      '  <StrictMode>',
      '    <App />',
      '  </StrictMode>,',
      ');',
      '',
    ].join('\n'),
    'utf8',
  );
  fs.writeFileSync(
    path.join(workspacePath, 'src', 'App.tsx'),
    [
      'import { BrowserRouter as Router, Route, Routes } from "react-router-dom";',
      'import { HomePage } from "./pages/HomePage";',
      'import { ScenePage } from "./pages/ScenePage";',
      '',
      'export default function App() {',
      '  return (',
      '    <Router basename={__XR_ENV_BASE__}>',
      '      <Routes>',
      '        <Route path="/" element={<HomePage />} />',
      '        <Route path="/scene" element={<ScenePage />} />',
      '      </Routes>',
      '    </Router>',
      '  );',
      '}',
      '',
    ].join('\n'),
    'utf8',
  );
  fs.writeFileSync(
    path.join(workspacePath, 'src', 'pages', 'HomePage.tsx'),
    [
      'export function HomePage() {',
      '  return (',
      '    <div>',
      '      <button>Open Spatial Scene</button>;',
      '      <button>Open Scene Route</button>;',
      '    </div>',
      '  );',
      '}',
      '',
    ].join('\n'),
    'utf8',
  );
  fs.writeFileSync(
    path.join(workspacePath, 'src', 'pages', 'ScenePage.tsx'),
    [
      'export function ScenePage() {',
      '  return <p>This route is intentionally separate so WebSpatial scene launching has a dedicated surface.</p>;',
      '}',
      '',
    ].join('\n'),
    'utf8',
  );
  fs.writeFileSync(
    path.join(workspacePath, 'src', 'App.css'),
    '.scene-panel { width: 720px; }\n',
    'utf8',
  );
  fs.writeFileSync(
    path.join(workspacePath, 'vite.config.ts'),
    'export default defineConfig({ plugins: [webSpatial()] });\n',
    'utf8',
  );

  const changed = syncLegacyWebSpatialScaffoldFiles({ workspacePath });

  assert.equal(changed, true);
  assert.match(fs.readFileSync(path.join(workspacePath, 'src', 'main.tsx'), 'utf8'), /snapdom/);
  assert.match(fs.readFileSync(path.join(workspacePath, 'src', 'spatial.ts'), 'utf8'), /WEBSPATIAL_FORK_REPOSITORY/);
  assert.match(fs.readFileSync(path.join(workspacePath, 'src', 'spatial.ts'), 'utf8'), /"--xr-back": String\(back\)/);
  assert.match(fs.readFileSync(path.join(workspacePath, 'src', 'App.tsx'), 'utf8'), /isSpatialRuntime/);
  assert.match(fs.readFileSync(path.join(workspacePath, 'src', 'App.tsx'), 'utf8'), /path="home"/);
  assert.match(
    fs.readFileSync(path.join(workspacePath, 'src', 'pages', 'ScenePage.tsx'), 'utf8'),
    /configurePersonaScene\(\)/,
  );
  assert.match(
    fs.readFileSync(path.join(workspacePath, 'src', 'pages', 'ScenePage.tsx'), 'utf8'),
    /scene-workspace-grid/,
  );
  assert.match(
    fs.readFileSync(path.join(workspacePath, 'src', 'pages', 'HomePage.tsx'), 'utf8'),
    /Launch XR Workspace/,
  );
  assert.doesNotMatch(
    fs.readFileSync(path.join(workspacePath, 'src', 'pages', 'HomePage.tsx'), 'utf8'),
    /configurePersonaScene\(\)/,
  );
  assert.match(fs.readFileSync(path.join(workspacePath, 'src', 'index.css'), 'utf8'), /html\.is-spatial #root/);
  assert.match(fs.readFileSync(path.join(workspacePath, 'src', 'App.css'), 'utf8'), /\.scene-workspace-grid/);
  assert.match(fs.readFileSync(path.join(workspacePath, 'vite.config.ts'), 'utf8'), /optimizeDeps/);
});

test('syncLegacyWebSpatialScaffoldFiles upgrades stale AndroidXR scaffold files to the latest persona shell scene', () => {
  const workspacePath = createTempWorkspace();
  fs.mkdirSync(path.join(workspacePath, 'src', 'pages'), { recursive: true });
  fs.mkdirSync(path.join(workspacePath, 'src', 'persona'), { recursive: true });
  fs.writeFileSync(
    path.join(workspacePath, 'oomi.runtime.json'),
    JSON.stringify({ renderMode: 'webspatial' }, null, 2),
    'utf8',
  );
  fs.writeFileSync(
    path.join(workspacePath, 'persona.json'),
    JSON.stringify(
      {
        id: 'chef-dev',
        name: 'Chef Dev',
        summary: 'Healthy dinner planner.',
        promptTemplateVersion: 'v1',
      },
      null,
      2,
    ),
    'utf8',
  );
  fs.writeFileSync(
    path.join(workspacePath, 'src', 'persona', 'config.ts'),
    [
      'export const personaConfig = {',
      '  slug: "chef-dev",',
      '  name: "Chef Dev",',
      '  description: "Healthy dinner planner.",',
      '  templateVersion: "v1",',
      '};',
      '',
    ].join('\n'),
    'utf8',
  );
  fs.writeFileSync(
    path.join(workspacePath, 'src', 'spatial.ts'),
    'export const WEBSPATIAL_FORK_COMMIT = "b2746721e4fe6b4f86dac0ea55938074eea00cda";\nexport function configurePersonaScene() {}\n',
    'utf8',
  );
  fs.writeFileSync(
    path.join(workspacePath, 'src', 'pages', 'HomePage.tsx'),
    [
      'export function HomePage() {',
      '  return (',
      '    <div>',
      '      <button>Launch Spatial Surface</button>',
      '      <button>Open Browser Preview</button>',
      '      <p>Focused surface</p>',
      '    </div>',
      '  );',
      '}',
      '',
    ].join('\n'),
    'utf8',
  );
  fs.writeFileSync(
    path.join(workspacePath, 'src', 'pages', 'ScenePage.tsx'),
    [
      'export function ScenePage() {',
      '  return <div>Awaiting AndroidXR interaction Interaction Console Fork-backed proof points</div>;',
      '}',
      '',
    ].join('\n'),
    'utf8',
  );

  const changed = syncLegacyWebSpatialScaffoldFiles({ workspacePath });

  assert.equal(changed, true);
  assert.match(
    fs.readFileSync(path.join(workspacePath, 'src', 'pages', 'HomePage.tsx'), 'utf8'),
    /Launch XR Workspace/,
  );
  assert.doesNotMatch(
    fs.readFileSync(path.join(workspacePath, 'src', 'pages', 'HomePage.tsx'), 'utf8'),
    /sceneMode/,
  );
  assert.doesNotMatch(
    fs.readFileSync(path.join(workspacePath, 'src', 'pages', 'ScenePage.tsx'), 'utf8'),
    /Awaiting AndroidXR interaction/,
  );
  assert.match(
    fs.readFileSync(path.join(workspacePath, 'src', 'pages', 'ScenePage.tsx'), 'utf8'),
    /configurePersonaScene\(\)/,
  );
  assert.match(
    fs.readFileSync(path.join(workspacePath, 'src', 'spatial.ts'), 'utf8'),
    /ac4bd47eb14a894ffef34a4044ddd0bbd47f3e72/,
  );
  assert.match(
    fs.readFileSync(path.join(workspacePath, 'src', 'spatial.ts'), 'utf8'),
    /"--xr-back": String\(back\)/,
  );
});

test('syncLegacyWebSpatialScaffoldFiles removes over-spatialized persona shell panels from stale AndroidXR scaffolds', () => {
  const workspacePath = createTempWorkspace();
  fs.mkdirSync(path.join(workspacePath, 'src', 'pages'), { recursive: true });
  fs.mkdirSync(path.join(workspacePath, 'src', 'persona'), { recursive: true });
  fs.writeFileSync(
    path.join(workspacePath, 'oomi.runtime.json'),
    JSON.stringify({ renderMode: 'webspatial' }, null, 2),
    'utf8',
  );
  fs.writeFileSync(
    path.join(workspacePath, 'persona.json'),
    JSON.stringify(
      {
        id: 'chef-dev',
        name: 'Chef Dev',
        summary: 'Healthy dinner planner.',
        promptTemplateVersion: 'v1',
      },
      null,
      2,
    ),
    'utf8',
  );
  fs.writeFileSync(
    path.join(workspacePath, 'src', 'persona', 'config.ts'),
    [
      'export const personaConfig = {',
      '  slug: "chef-dev",',
      '  name: "Chef Dev",',
      '  description: "Healthy dinner planner.",',
      '  templateVersion: "v1",',
      '};',
      '',
    ].join('\n'),
    'utf8',
  );
  fs.writeFileSync(
    path.join(workspacePath, 'src', 'pages', 'HomePage.tsx'),
    [
      'export function HomePage() {',
      '  return (',
      '    <main>',
      '      <button className="persona-button" onClick={openPersonaScene} enable-xr style={xrStyle(52, "regular")}>',
      '        Launch Spatial Surface',
      '      </button>',
      '      <Link className="persona-link" to="/scene" target="_blank" enable-xr style={xrStyle(92, "thin")}>',
      '        Open Spatial Preview',
      '      </Link>',
      '      <aside className="persona-panel persona-runtime" enable-xr style={xrStyle(72, "thin")}>runtime</aside>',
      '      <article className="persona-panel persona-card" enable-xr style={xrStyle(34, "translucent")}>card</article>',
      '    </main>',
      '  );',
      '}',
      '',
    ].join('\n'),
    'utf8',
  );
  fs.writeFileSync(
    path.join(workspacePath, 'src', 'pages', 'ScenePage.tsx'),
    [
      'export function ScenePage() {',
      '  return <div>scene</div>;',
      '}',
      '',
    ].join('\n'),
    'utf8',
  );
  fs.writeFileSync(
    path.join(workspacePath, 'src', 'App.css'),
    [
      'html.is-spatial .persona-runtime {',
      '  transform: translateZ(20px) rotateX(10deg);',
      '}',
      '',
    ].join('\n'),
    'utf8',
  );

  const changed = syncLegacyWebSpatialScaffoldFiles({ workspacePath });
  const homePage = fs.readFileSync(path.join(workspacePath, 'src', 'pages', 'HomePage.tsx'), 'utf8');
  const styles = fs.readFileSync(path.join(workspacePath, 'src', 'App.css'), 'utf8');

  assert.equal(changed, true);
  assert.match(homePage, /Launch XR Workspace/);
  assert.doesNotMatch(homePage, /persona-panel persona-runtime" enable-xr/);
  assert.doesNotMatch(homePage, /persona-card" enable-xr style=\{xrStyle/);
  assert.doesNotMatch(homePage, /enable-xr/);
  assert.doesNotMatch(homePage, /sceneMode/);
  assert.doesNotMatch(styles, /html\.is-spatial \.persona-runtime \{/);
  assert.doesNotMatch(styles, /html\.is-spatial \.persona-scene-root \{/);
  assert.doesNotMatch(styles, /html\.is-spatial \.persona-button,/);
  assert.doesNotMatch(styles, /html\.is-spatial \.persona-card,/);
  assert.match(styles, /\.scene-workspace-grid/);
});

test('syncLegacyWebSpatialScaffoldFiles updates stale webspatial runtime config and scripts', () => {
  const workspacePath = createTempWorkspace();
  fs.writeFileSync(
    path.join(workspacePath, 'oomi.runtime.json'),
    JSON.stringify({ renderMode: 'webspatial', healthPath: '/oomi.health.json' }, null, 2),
    'utf8',
  );
  fs.writeFileSync(
    path.join(workspacePath, 'package.json'),
    JSON.stringify(
      {
        name: 'persona-proof',
        scripts: {
          dev: 'vite --host 127.0.0.1 --port 4789',
          'dev:avp': 'cross-env XR_ENV=avp vite --host 127.0.0.1 --port 4789',
          preview: 'vite preview --host 127.0.0.1 --port 4789',
        },
      },
      null,
      2,
    ),
    'utf8',
  );

  const changed = syncLegacyWebSpatialScaffoldFiles({ workspacePath });
  const runtimeConfig = JSON.parse(fs.readFileSync(path.join(workspacePath, 'oomi.runtime.json'), 'utf8'));
  const packageJson = JSON.parse(fs.readFileSync(path.join(workspacePath, 'package.json'), 'utf8'));

  assert.equal(changed, true);
  assert.equal(runtimeConfig.healthPath, '/webspatial/avp/oomi.health.json');
  assert.equal(packageJson.scripts.dev, 'vite --host 0.0.0.0 --port 4789 --strictPort');
  assert.equal(packageJson.scripts['dev:avp'], 'cross-env XR_ENV=avp vite --host 0.0.0.0 --port 4789 --strictPort');
  assert.equal(packageJson.scripts.preview, 'vite preview --host 0.0.0.0 --port 4789 --strictPort');
});

test('matchesPersonaRuntimeCommand requires the expected workspace and vite entrypoint', () => {
  const workspacePath = path.join('C:', 'persona-workspace');
  const viteScriptPath = path.join(workspacePath, 'node_modules', 'vite', 'bin', 'vite.js');

  assert.equal(
    matchesPersonaRuntimeCommand(
      `${process.execPath} ${viteScriptPath} --host 0.0.0.0 --port 4789 --strictPort`,
      {
        workspacePath,
        localPort: 4789,
        expectedCommand: {
          command: process.execPath,
          args: [viteScriptPath, '--host', '0.0.0.0', '--port', '4789', '--strictPort'],
        },
      }
    ),
    true
  );

  assert.equal(
    matchesPersonaRuntimeCommand(
      path.join(workspacePath, 'node_modules', '@esbuild', 'linux-x64', 'bin', 'esbuild') + ' --service=0.25.12 --ping',
      {
        workspacePath,
        localPort: 4789,
        expectedCommand: {
          command: process.execPath,
          args: [viteScriptPath, '--host', '0.0.0.0', '--port', '4789', '--strictPort'],
        },
      }
    ),
    false
  );
});
