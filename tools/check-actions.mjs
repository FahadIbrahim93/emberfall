#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseDocument } from 'yaml';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function checkWorkflow(source, filename = 'workflow.yml') {
  const document = parseDocument(source, { uniqueKeys: true });
  if (document.errors.length) return document.errors.map(error => `${filename}: ${error.message}`);
  const problems = [];
  function visit(value, location) {
    if (!value || typeof value !== 'object') return;
    if (Array.isArray(value)) return value.forEach((item, i) => visit(item, `${location}[${i}]`));
    for (const [key, item] of Object.entries(value)) {
      if (key === 'uses') {
        const immutable = typeof item === 'string' && (
          (item.startsWith('./') && !/\s|\\/.test(item) && !item.split('/').includes('..')) ||
          /^[\w.-]+\/[\w.-]+(?:\/[\w./-]+)?@[a-f0-9]{40}$/.test(item) ||
          /^docker:\/\/[^\s@]+@sha256:[a-f0-9]{64}$/.test(item)
        );
        if (!immutable) problems.push(`${filename}:${location}.uses must reference a full commit SHA or image digest: ${String(item)}`);
      } else visit(item, `${location}.${key}`);
    }
  }
  visit(document.toJS({ maxAliasCount: 100 }), '$');
  return problems;
}

export function checkActions(root = ROOT) {
  const directory = path.join(root, '.github', 'workflows');
  return fs.readdirSync(directory).filter(file => /\.ya?ml$/.test(file)).flatMap(file =>
    checkWorkflow(fs.readFileSync(path.join(directory, file), 'utf8'), `.github/workflows/${file}`));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const problems = checkActions();
    if (problems.length) throw new Error(problems.join('\n'));
    console.log('ACTIONS: every workflow action is pinned to an immutable revision');
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
