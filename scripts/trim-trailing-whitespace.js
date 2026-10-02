#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

// Keep generated OpenAPI client diffs stable by removing trailing spaces only.
const textExtensions = new Set([
  '.dart',
  '.json',
  '.md',
  '.ts',
  '.yaml',
  '.yml',
]);

function isTextFile(filePath) {
  return textExtensions.has(path.extname(filePath).toLowerCase());
}

function walk(targetPath) {
  const stat = fs.lstatSync(targetPath);
  if (stat.isSymbolicLink()) throw new Error('symbolic_link_input_rejected');
  if (stat.isDirectory()) {
    for (const entry of fs.readdirSync(targetPath).sort()) {
      walk(path.join(targetPath, entry));
    }
    return;
  }
  if (!stat.isFile() || !isTextFile(targetPath)) {
    return;
  }

  if (fs.constants.O_NOFOLLOW === undefined) throw new Error('no_follow_file_open_unavailable');
  const descriptor = fs.openSync(targetPath, fs.constants.O_RDWR | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
  try {
    if (!fs.fstatSync(descriptor).isFile()) throw new Error('regular_file_input_required');
    const original = fs.readFileSync(descriptor, 'utf8');
    const trimmed = original
      .replace(/[ \t]+$/gmu, '')
      .replace(/(?:\r?\n)*$/u, '\n');
    if (trimmed !== original) {
      const bytes = Buffer.from(trimmed, 'utf8');
      let offset = 0;
      while (offset < bytes.length) {
        const count = fs.writeSync(descriptor, bytes, offset, bytes.length - offset, offset);
        if (count === 0) throw new Error('file_write_incomplete');
        offset += count;
      }
      fs.ftruncateSync(descriptor, bytes.length);
    }
  } finally {
    fs.closeSync(descriptor);
  }
}

if (require.main === module) {
  const roots = process.argv.slice(2);
  if (roots.length === 0) {
    console.error('Usage: node scripts/trim-trailing-whitespace.js <path> [<path> ...]');
    process.exit(1);
  }
  for (const root of roots) {
    walk(path.resolve(root));
  }
}

module.exports = { walk };
