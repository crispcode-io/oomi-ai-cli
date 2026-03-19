import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const DEFAULT_TEMPLATE_ID = 'persona-app';
export const DEFAULT_TEMPLATE_VERSION = 'v1';

const PACKAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TEMPLATE_ROOT = path.join(PACKAGE_ROOT, 'templates');

export function readTemplateDescriptor(templateRoot) {
  const descriptorPath = path.join(templateRoot, 'template.json');
  if (!fs.existsSync(descriptorPath)) {
    throw new Error(`Template descriptor not found: ${descriptorPath}`);
  }

  return JSON.parse(fs.readFileSync(descriptorPath, 'utf8'));
}

export function resolveTemplateRoot(
  templateId = DEFAULT_TEMPLATE_ID,
  version = DEFAULT_TEMPLATE_VERSION,
) {
  const templateRoot = path.join(TEMPLATE_ROOT, templateId);
  if (!fs.existsSync(templateRoot)) {
    throw new Error(`Unknown template: ${templateId}`);
  }

  const descriptor = readTemplateDescriptor(templateRoot);
  if (descriptor.version !== version) {
    throw new Error(
      `Unsupported template version "${version}" for ${templateId}. Available version: ${descriptor.version}`,
    );
  }

  return templateRoot;
}

export function renderTemplateFile(content, variables) {
  let rendered = content;
  for (const [token, value] of Object.entries(variables)) {
    rendered = rendered.split(token).join(String(value));
  }
  return rendered;
}
