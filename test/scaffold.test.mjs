import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { scaffoldPersonaApp } from '../lib/scaffold.js';

function tempDir(name) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `${name}-`));
}

const PACKAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('scaffoldPersonaApp creates expected files and replaces placeholders', () => {
  const outDir = path.join(tempDir('oomi-scaffold'), 'market-analyst');
  const result = scaffoldPersonaApp({
    slug: 'market-analyst',
    name: 'Market Analyst',
    description: 'Private app for reviewing my broker positions and risk.',
    outDir,
  });

  assert.equal(result.ok, true);
  assert.match(result.startCommand, /npm run dev:avp/);
  assert.ok(fs.existsSync(path.join(outDir, 'package.json')));
  assert.ok(fs.existsSync(path.join(outDir, 'vite.config.ts')));
  assert.ok(fs.existsSync(path.join(outDir, 'public', 'oomi.health.json')));
  assert.ok(fs.existsSync(path.join(outDir, 'public', 'manifest.webmanifest')));
  assert.ok(
    fs.existsSync(path.join(outDir, 'vendor', 'webspatial', 'core-sdk', 'dist', 'index.js')),
  );
  assert.ok(
    fs.existsSync(path.join(outDir, 'vendor', 'webspatial', 'react-sdk', 'dist', 'default', 'index.js')),
  );

  const packageJson = JSON.parse(fs.readFileSync(path.join(outDir, 'package.json'), 'utf8'));
  assert.equal(
    packageJson.dependencies['@webspatial/core-sdk'],
    'file:./vendor/webspatial/core-sdk',
  );
  assert.equal(
    packageJson.dependencies['@webspatial/react-sdk'],
    'file:./vendor/webspatial/react-sdk',
  );

  const personaConfig = fs.readFileSync(
    path.join(outDir, 'src', 'persona', 'config.ts'),
    'utf8',
  );
  const appSource = fs.readFileSync(path.join(outDir, 'src', 'App.tsx'), 'utf8');
  const scenePage = fs.readFileSync(path.join(outDir, 'src', 'pages', 'ScenePage.tsx'), 'utf8');
  const spatialSource = fs.readFileSync(path.join(outDir, 'src', 'spatial.ts'), 'utf8');
  const indexCss = fs.readFileSync(path.join(outDir, 'src', 'index.css'), 'utf8');
  const scaffoldReadme = fs.readFileSync(path.join(outDir, 'README.md'), 'utf8');
  const personaNotes = fs.readFileSync(path.join(outDir, 'src', 'persona', 'notes.ts'), 'utf8');
  assert.match(personaConfig, /market-analyst/);
  assert.match(personaConfig, /Market Analyst/);
  assert.doesNotMatch(personaConfig, /__OOMI_PERSONA_/);
  assert.match(appSource, /isSpatialRuntime/);
  assert.match(appSource, /path="home"/);
  assert.match(scenePage, /configurePersonaScene\(\)/);
  assert.match(scenePage, /console\.info\("\[persona\] spatial runtime"/);
  assert.match(scenePage, /enable-xr/);
  assert.match(spatialSource, /"--xr-back": String\(back\)/);
  assert.match(indexCss, /html\.is-spatial #root/);
  assert.match(scaffoldReadme, /Managed Launch Contract/);
  assert.match(scaffoldReadme, /oomi personas launch-managed/);
  assert.match(personaNotes, /enable-xr/);
  assert.match(personaNotes, /launch-managed/);
});

test('scaffoldPersonaApp rejects non-empty output directory without force', () => {
  const outDir = tempDir('oomi-scaffold-force');
  fs.writeFileSync(path.join(outDir, 'existing.txt'), 'occupied', 'utf8');

  assert.throws(
    () =>
      scaffoldPersonaApp({
        slug: 'writer',
        name: 'Writer',
        description: 'Drafts clean briefings.',
        outDir,
      }),
    /Use --force to overwrite/,
  );
});

test('oomi personas scaffold --json prints machine-readable output', () => {
  const outDir = path.join(tempDir('oomi-cli-scaffold'), 'persona-app');
  const cliPath = path.join(PACKAGE_ROOT, 'bin', 'oomi-ai.js');
  const result = spawnSync(
    process.execPath,
    [
      cliPath,
      'personas',
      'scaffold',
      'persona-app',
      '--name',
      'Persona App',
      '--description',
      'Private app surface.',
      '--out',
      outDir,
      '--json',
    ],
    {
      cwd: PACKAGE_ROOT,
      env: {
        ...process.env,
        OOMI_SKIP_UPDATE_CHECK: '1',
      },
      encoding: 'utf8',
    },
  );

  assert.equal(result.status, 0, result.stderr);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.ok, true);
  assert.equal(payload.slug, 'persona-app');
  assert.equal(payload.templateVersion, 'v1');
  assert.ok(fs.existsSync(path.join(outDir, 'oomi.runtime.json')));
});
