#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const repoRoot = process.cwd();
const outputPath = process.argv[2] || 'docs/runbooks/todo-triage.md';

const targetRoots = [
  'lib',
  'apps/control-panel/src',
  'apps/marketing-site/src',
  'scripts',
];

const ignoredDirNames = new Set([
  '.git',
  '.dart_tool',
  '.idea',
  '.vscode',
  'build',
  'dist',
  'node_modules',
]);

const ignoredPathFragments = [
  `${path.sep}lib${path.sep}generated${path.sep}`,
  `${path.sep}ios${path.sep}`,
  `${path.sep}android${path.sep}`,
  `${path.sep}macos${path.sep}`,
  `${path.sep}windows${path.sep}`,
  `${path.sep}linux${path.sep}`,
  `${path.sep}web${path.sep}`,
  `${path.sep}.dart_tool${path.sep}`,
];

const todoPattern = /\b(TODO|FIXME|HACK)\b/i;
const p1Pattern = /(authLevel:\s*'anonymous'|change to 'function'|key\s?vault|jwt_secret|security|signing|production)/i;
const ignoredExactFiles = new Set([
  normalize(path.relative(repoRoot, __filename)),
  normalize(outputPath),
]);

function walk(dir, out) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (ignoredDirNames.has(entry.name)) continue;
      walk(abs, out);
      continue;
    }
    out.push(abs);
  }
}

function normalize(p) {
  return p.split(path.sep).join('/');
}

function classify(record) {
  if (p1Pattern.test(record.text)) return 'P1';
  if (record.file.startsWith('lib/core/') || record.file.startsWith('lib/features/')) return 'P2';
  return 'P3';
}

const files = [];
for (const root of targetRoots) {
  walk(path.join(repoRoot, root), files);
}

const records = [];
for (const fileAbs of files) {
  const normalized = normalize(path.relative(repoRoot, fileAbs));
  if (ignoredExactFiles.has(normalized)) continue;
  if (ignoredPathFragments.some(fragment => fileAbs.includes(fragment))) continue;
  const content = fs.readFileSync(fileAbs, 'utf8');
  const lines = content.split(/\r?\n/);
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (!todoPattern.test(line)) continue;
    const text = line.trim();
    if (!text) continue;
    records.push({
      file: normalized,
      line: i + 1,
      text,
    });
  }
}

for (const record of records) {
  record.priority = classify(record);
}

const grouped = {
  P1: records.filter(r => r.priority === 'P1'),
  P2: records.filter(r => r.priority === 'P2'),
  P3: records.filter(r => r.priority === 'P3'),
};

function renderRows(items, limit) {
  if (items.length === 0) return ['| _None_ |  |', ''];
  const rows = [];
  for (const item of items.slice(0, limit)) {
    rows.push(`| \`${item.file}:${item.line}\` | ${item.text.replace(/\|/g, '\\|')} |`);
  }
  return rows;
}

const generatedAt = new Date().toISOString();
const md = [
  '# TODO Triage Register',
  '',
  `Generated: ${generatedAt}`,
  '',
  'Scope: `lib`, `apps`, `packages`, and `scripts` (generated/mobile platform folders excluded).',
  '',
  '## Summary',
  '',
  `- P1: ${grouped.P1.length}`,
  `- P2: ${grouped.P2.length}`,
  `- P3: ${grouped.P3.length}`,
  '',
  '## P1 (Launch-sensitive)',
  '',
  '| Location | Note |',
  '| --- | --- |',
  ...renderRows(grouped.P1, 50),
  '',
  '## P2 (Product/engineering debt)',
  '',
  '| Location | Note |',
  '| --- | --- |',
  ...renderRows(grouped.P2, 100),
  '',
  '## P3 (Deferred polish)',
  '',
  '| Location | Note |',
  '| --- | --- |',
  ...renderRows(grouped.P3, 100),
  '',
  '## Usage',
  '',
  'Run `node scripts/generate-todo-triage.js` to refresh this file.',
  '',
];

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${md.join('\n')}\n`);

console.log(`Wrote ${outputPath}`);
console.log(`P1=${grouped.P1.length} P2=${grouped.P2.length} P3=${grouped.P3.length}`);
