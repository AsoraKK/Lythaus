import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const output = process.argv[2] ?? 'apps/marketing-site/dist';
const site = 'https://lythaus.co';
const violations = [];
const retiredBrand = ['as', 'ora'].join('');
const retiredCloudHost = ['az', 'ure', 'websites'].join('');
const forbiddenPublicDomain = new RegExp(`(${retiredBrand}\\.co\\.za|pages\\.dev|${retiredCloudHost}\\.net)`, 'i');

function walk(directory) {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

function routeFor(file) {
  const rel = relative(output, file).split(sep).join('/');
  if (rel === 'index.html') return '/';
  return `/${rel.replace(/\/index\.html$/, '')}`;
}

function normalizedUrl(value) {
  return value === `${site}/` ? site : value.replace(/\/$/, '');
}

if (!existsSync(output)) {
  console.error(`Marketing output is missing: ${output}`);
  process.exit(1);
}

const htmlFiles = walk(output).filter((file) => file.endsWith('.html'));
const routes = new Set(htmlFiles.map(routeFor));
const expectedCanonicals = new Set();

for (const file of htmlFiles) {
  const content = readFileSync(file, 'utf8');
  const route = routeFor(file);
  const expected = normalizedUrl(`${site}${route}`);
  expectedCanonicals.add(expected);

  const doctypes = content.match(/<!doctype html>/gi) ?? [];
  const canonical = content.match(/<link rel="canonical" href="([^"]+)"/i)?.[1];
  const openGraph = content.match(/<meta property="og:url" content="([^"]+)"/i)?.[1];

  if (doctypes.length !== 1) violations.push(`${route}: expected one document shell, found ${doctypes.length}`);
  if (normalizedUrl(canonical ?? '') !== expected) violations.push(`${route}: canonical is ${canonical ?? 'missing'}`);
  if (normalizedUrl(openGraph ?? '') !== expected) violations.push(`${route}: og:url is ${openGraph ?? 'missing'}`);

  for (const href of content.matchAll(/href="([^"]+)"/gi)) {
    const value = href[1];
    if (!value.startsWith('/') || value.startsWith('//')) continue;
    const path = value.split(/[?#]/, 1)[0] || '/';
    if (routes.has(path)) continue;
    const asset = join(output, path.replace(/^\//, ''));
    if (!existsSync(asset)) violations.push(`${route}: broken internal link ${value}`);
  }

  if (forbiddenPublicDomain.test(content)) {
    violations.push(`${route}: forbidden public-domain reference`);
  }
}

const sitemapPath = join(output, 'sitemap.xml');
const robotsPath = join(output, 'robots.txt');
const headersPath = join(output, '_headers');
if (!existsSync(sitemapPath)) violations.push('sitemap.xml is missing');
if (!existsSync(robotsPath)) violations.push('robots.txt is missing');
if (!existsSync(headersPath)) violations.push('_headers is missing');

if (existsSync(sitemapPath)) {
  const sitemap = readFileSync(sitemapPath, 'utf8');
  const locations = new Set(
    [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => normalizedUrl(match[1])),
  );
  for (const canonical of expectedCanonicals) {
    if (!locations.has(canonical)) violations.push(`sitemap is missing ${canonical}`);
  }
}

if (existsSync(robotsPath)) {
  const robots = readFileSync(robotsPath, 'utf8');
  if (!robots.includes(`Sitemap: ${site}/sitemap.xml`)) violations.push('robots.txt has no canonical sitemap URL');
}

if (existsSync(headersPath)) {
  const headers = readFileSync(headersPath, 'utf8');
  const requiredHeaders = [
    'X-Content-Type-Options: nosniff',
    'Referrer-Policy: strict-origin-when-cross-origin',
    'X-Frame-Options: DENY',
    'Permissions-Policy:',
    'Strict-Transport-Security: max-age=300',
    "Content-Security-Policy: default-src 'self'",
    "connect-src 'self' https://api.lythaus.co",
  ];
  for (const required of requiredHeaders) {
    if (!headers.includes(required)) violations.push(`_headers is missing ${required}`);
  }
  if (forbiddenPublicDomain.test(headers)) {
    violations.push('_headers contains a forbidden public-domain reference');
  }
}

if (violations.length) {
  violations.forEach((violation) => console.error(`- ${violation}`));
  process.exit(1);
}

console.log(`Marketing output contract passed for ${htmlFiles.length} route(s).`);
