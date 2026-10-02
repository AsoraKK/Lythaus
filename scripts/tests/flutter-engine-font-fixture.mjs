import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

// Flutter engine fallback fonts are fixtures, never a live network dependency.
// Only these pinned URLs are fulfilled; unexpected resources still fail.
const fixtures = JSON.parse(await readFile(new URL('./fixtures/flutter-engine-fonts.json', import.meta.url), 'utf8'));
const fonts = fixtures.map(fixture => {
  const body = Buffer.from(fixture.base64, 'base64');
  assert.equal(createHash('sha256').update(body).digest('hex'), fixture.sha256, fixture.source);
  return { url: fixture.source, body };
});

export async function installFlutterEngineFonts(context) {
  for (const font of fonts) {
    await context.route(font.url, route => route.fulfill({
      contentType: 'font/woff2', body: font.body,
      headers: { 'access-control-allow-origin': '*' },
    }));
  }
}
