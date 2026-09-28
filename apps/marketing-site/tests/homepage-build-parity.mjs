import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
assert.ok(process.env.HOMEPAGE_QA_DIR, 'Set HOMEPAGE_QA_DIR to the captured evidence directory');
const evidence = path.resolve(process.env.HOMEPAGE_QA_DIR);
const before = path.join(evidence, 'homepage-before/dist');
const after = path.join(root, 'apps/marketing-site/dist');
const require = createRequire(path.join(root, 'apps/marketing-site/package.json'));
const postcss = require('postcss');
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
function cascade(css) {
  const events = [];
  function visit(nodes, scope = []) {
    for (const node of nodes) {
      if (node.type === 'atrule') {
        if (node.nodes?.every((child) => child.type === 'decl')) {
          events.push({ fixed: [scope, node.name, node.params, node.nodes.map((item) => [item.prop, item.value, Boolean(item.important)])] });
        } else if (node.nodes) visit(node.nodes, [...scope, [node.name, node.params]]);
        else events.push({ fixed: [scope, node.name, node.params] });
      }
      if (node.type === 'rule') {
        for (const selector of postcss.list.comma(node.selector)) {
          for (const declaration of node.nodes) {
            if (declaration.type !== 'decl') continue;
            events.push({ key: JSON.stringify([scope, selector, declaration.prop, Boolean(declaration.important)]), value: declaration.value });
          }
        }
      }
    }
  }
  visit(postcss.parse(css).nodes);
  const last = new Map(events.flatMap((event, index) => event.key ? [[event.key, index]] : []));
  return events.filter((event, index) => !event.key || last.get(event.key) === index);
}
async function bundle(directory) {
  const html = await readFile(path.join(directory, 'index.html'), 'utf8');
  const assets = new Map();
  for (const tag of html.matchAll(/<(?:script|link|img|source)\b[^>]*>/gu)) {
    for (const attribute of tag[0].matchAll(/(?:src|href)="(\/[^"#?]+)(?:[?#][^"]*)?"/gu)) {
      const filename = attribute[1];
      const bytes = await readFile(path.join(directory, filename.slice(1)));
      assets.set(filename, { bytes: bytes.length, sha256: sha(bytes) });
    }
  }
  const manifest = JSON.parse(await readFile(path.join(directory, 'site.webmanifest'), 'utf8'));
  for (const icon of manifest.icons) {
    const bytes = await readFile(path.join(directory, icon.src.replace(/^\//u, '')));
    assets.set(icon.src, { bytes: bytes.length, sha256: sha(bytes) });
  }
  let normalized = html;
  for (const [filename, asset] of assets) normalized = normalized.replaceAll(filename, `asset:${asset.sha256}`);
  const stylesheets = [...assets.keys()].filter((filename) => filename.endsWith('.css'));
  const css = (await Promise.all(stylesheets.map((filename) => readFile(path.join(directory, filename.slice(1)), 'utf8')))).join('\n');
  const effectiveCascade = cascade(css);
  const htmlWithoutStylesheetPackaging = html.replace(/(?:<link rel="stylesheet" href="[^"]+">)+/gu, '<!-- frozen stylesheet cascade -->');
  let siteBytes = 0;
  let siteFiles = 0;
  async function count(dir) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) await count(file);
      else { siteBytes += (await readFile(file)).length; siteFiles += 1; }
    }
  }
  await count(directory);
  return { htmlSha256: sha(html), normalizedHtmlSha256: sha(normalized), htmlWithoutStylesheetPackagingSha256: sha(htmlWithoutStylesheetPackaging), cssCascadeSha256: sha(JSON.stringify(effectiveCascade)), cssCascadeRecords: effectiveCascade.length, htmlBytes: Buffer.byteLength(html), homepageAssetBytes: [...assets.values()].reduce((total, item) => total + item.bytes, 0), assets: Object.fromEntries(assets), siteBytes, siteFiles };
}
const report = { baselineSha: '8e3b3ebad2f846e61db2bfe819376723da7e9863', before: await bundle(before), after: await bundle(after) };
report.htmlByteExact = report.before.htmlSha256 === report.after.htmlSha256;
report.htmlEqualWithContentAddressedAssets = report.before.normalizedHtmlSha256 === report.after.normalizedHtmlSha256;
report.homepageAssetContentExact = JSON.stringify(Object.values(report.before.assets)) === JSON.stringify(Object.values(report.after.assets));
report.htmlContentExactExceptStylesheetPackaging = report.before.htmlWithoutStylesheetPackagingSha256 === report.after.htmlWithoutStylesheetPackagingSha256;
report.orderedCssCascadeExact = report.before.cssCascadeSha256 === report.after.cssCascadeSha256;
const nonCss = (assets) => Object.fromEntries(Object.entries(assets).filter(([filename]) => !filename.endsWith('.css')));
report.nonCssAssetsByteExact = JSON.stringify(nonCss(report.before.assets)) === JSON.stringify(nonCss(report.after.assets));
await writeFile(path.join(evidence, 'homepage-build-parity.json'), JSON.stringify(report, null, 2));
assert.equal(report.htmlContentExactExceptStylesheetPackaging, true, 'Homepage HTML changed beyond stylesheet packaging');
assert.equal(report.orderedCssCascadeExact, true, 'Homepage ordered CSS cascade changed');
assert.equal(report.nonCssAssetsByteExact, true, 'Homepage non-CSS asset bytes changed');
console.log(JSON.stringify({ htmlByteExact: report.htmlByteExact, htmlContentExactExceptStylesheetPackaging: report.htmlContentExactExceptStylesheetPackaging, orderedCssCascadeExact: report.orderedCssCascadeExact, nonCssAssetsByteExact: report.nonCssAssetsByteExact, beforeBytes: report.before.homepageAssetBytes, afterBytes: report.after.homepageAssetBytes, siteByteDelta: report.after.siteBytes - report.before.siteBytes }, null, 2));
