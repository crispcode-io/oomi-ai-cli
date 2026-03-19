import fs from 'node:fs';
import path from 'node:path';

import {
  DEFAULT_TEMPLATE_ID,
  DEFAULT_TEMPLATE_VERSION,
  readTemplateDescriptor,
  renderTemplateFile,
  resolveTemplateRoot,
} from './template.js';

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function validatePersonaSlug(slug) {
  if (typeof slug !== 'string' || !slug.trim()) {
    throw new Error('Persona slug is required.');
  }

  const normalized = slug.trim();
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(normalized)) {
    throw new Error(
      'Persona slug must use lowercase letters, numbers, and single dashes only.',
    );
  }

  return normalized;
}

function ensureWritableOutputDir(outDir, force) {
  if (!outDir) {
    throw new Error('Output directory is required. Use --out <path>.');
  }

  if (!fs.existsSync(outDir)) {
    ensureDir(outDir);
    return;
  }

  const entries = fs.readdirSync(outDir);
  if (entries.length > 0 && !force) {
    throw new Error(`Output directory is not empty: ${outDir}. Use --force to overwrite.`);
  }
}

function copyTemplateTree(sourceRoot, targetRoot, variables) {
  const entries = fs.readdirSync(sourceRoot, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === 'template.json') {
      continue;
    }

    const sourcePath = path.join(sourceRoot, entry.name);
    const targetPath = path.join(targetRoot, entry.name);

    if (entry.isDirectory()) {
      ensureDir(targetPath);
      copyTemplateTree(sourcePath, targetPath, variables);
      continue;
    }

    const content = fs.readFileSync(sourcePath, 'utf8');
    fs.writeFileSync(targetPath, renderTemplateFile(content, variables), 'utf8');
  }
}

export function scaffoldPersonaApp({
  slug,
  name,
  description,
  outDir,
  templateVersion = DEFAULT_TEMPLATE_VERSION,
  templateId = DEFAULT_TEMPLATE_ID,
  force = false,
}) {
  const safeSlug = validatePersonaSlug(slug);
  const safeName = typeof name === 'string' && name.trim() ? name.trim() : safeSlug;
  const safeDescription = typeof description === 'string' ? description.trim() : '';
  if (!safeDescription) {
    throw new Error('Persona description is required. Use --description "<text>".');
  }

  const resolvedOutDir = path.resolve(outDir);
  const templateRoot = resolveTemplateRoot(templateId, templateVersion);
  const descriptor = readTemplateDescriptor(templateRoot);
  const variables = {
    __OOMI_PERSONA_SLUG__: safeSlug,
    __OOMI_PERSONA_NAME__: safeName,
    __OOMI_PERSONA_DESCRIPTION__: safeDescription,
    __OOMI_TEMPLATE_VERSION__: templateVersion,
  };

  ensureWritableOutputDir(resolvedOutDir, force);
  copyTemplateTree(templateRoot, resolvedOutDir, variables);

  return {
    ok: true,
    templateId,
    templateVersion,
    slug: safeSlug,
    outDir: resolvedOutDir,
    startCommand: `cd ${resolvedOutDir} && npm install && ${descriptor.startCommand || 'npm run dev'}`,
    healthPath: descriptor.healthPath,
    editableZones: descriptor.editableZones,
    defaultPort: descriptor.defaultPort,
  };
}
