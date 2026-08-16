import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve(import.meta.dirname, '..');
const homepage = fs.readFileSync(path.join(root, 'src/pages/index.astro'), 'utf8');
const layout = fs.readFileSync(path.join(root, 'src/layouts/BaseLayout.astro'), 'utf8');
const privacy = fs.readFileSync(path.join(root, 'src/pages/privacy/index.astro'), 'utf8');
const styles = fs.readFileSync(path.join(root, 'src/styles/global.css'), 'utf8');
const headers = fs.readFileSync(path.join(root, 'public/_headers'), 'utf8');

test('homepage uses the approved waitlist submission and accessible states', () => {
  assert.match(homepage, /aria-live="polite"/);
  assert.match(homepage, /const successMessage = "You're on the list\. Thanks for joining Lythaus\. We'll be in touch when there is something worth sharing\."/);
  assert.match(homepage, /if \(success instanceof HTMLElement\) success\.hidden = false;\s*setStatus\(successMessage, 'success'\);/);
  assert.match(homepage, /button\.disabled = true/);
  assert.match(homepage, /Joining\.\.\./);
  assert.match(homepage, /fetch\(`\$\{apiBaseUrl\}\/api\/waitlist`/);
  assert.match(homepage, /consentVersion: 'waitlist-v1'/);
  assert.match(homepage, /action: 'waitlist_signup'/);
  assert.match(homepage, /appearance: 'interaction-only'/);
  assert.match(homepage, /execution: 'execute'/);
  assert.match(homepage, /'expired-callback': handleVerificationFailure/);
  assert.match(homepage, /'error-callback': handleVerificationFailure/);
  assert.match(homepage, /const handleVerificationFailure = \(\) => \{/);
  assert.match(homepage, /window\.turnstile\.reset\(widgetId\)/);
  assert.match(homepage, /form\.reset\(\)/);
  assert.match(homepage, /input\.reportValidity\(\)/);
  assert.match(homepage, /aria-describedby="waitlist-consent waitlist-status"/);
  assert.match(homepage, /role="status"/);
  assert.doesNotMatch(homepage, /You are on the list\. We will be in touch when a place opens\./);
});

test('homepage public copy stays restrained and launch safe', () => {
  const publicSource = `${homepage}\n${layout}`;
  const visibleCopy = publicSource.replace(/<script[\s\S]*?<\/script>/giu, '');
  assert.doesNotMatch(visibleCopy, /\u2014/u);
  assert.doesNotMatch(visibleCopy, /lime|neon green|purple gradient|PlanetScale|Hyperdrive|Cloudflare|C2PA|stylometric|confidence score|policy engine|appeal threshold|moderation weight/i);
  assert.match(homepage, /The internet is changing\.<br \/>Trust should not disappear with it\./);
  assert.match(homepage, /Join the waitlist/);
  assert.match(styles, /--accent: #f2c98d/i);
});

test('shared layout declares the Lythaus favicon assets', () => {
  assert.match(layout, /<link rel="icon" href="\/favicon\.ico" sizes="any" \/>/);
  assert.match(layout, /<link rel="icon" type="image\/png" href="\/favicon\.png" sizes="64x64" \/>/);
  assert.ok(fs.existsSync(path.join(root, 'public/favicon.ico')));
  assert.ok(fs.existsSync(path.join(root, 'public/favicon.png')));
});

test('Turnstile CSP is narrowly allowlisted', () => {
  assert.match(headers, /script-src[^\n]+https:\/\/challenges\.cloudflare\.com/);
  assert.match(headers, /frame-src https:\/\/challenges\.cloudflare\.com/);
  assert.doesNotMatch(headers, /script-src[^\n]+\*/);
});

test('homepage layout remains bounded at desktop and 390 pixel widths', () => {
  assert.match(styles, /\.home-waitlist \{[\s\S]*grid-template-columns: minmax\(0, 0\.9fr\) minmax\(380px, 0\.75fr\)/);
  assert.match(styles, /\.home-waitlist \{[\s\S]*min-width: 0/);
  assert.match(styles, /@media \(max-width: 700px\) \{[\s\S]*?\.home-waitlist-fields \{[\s\S]*?grid-template-columns: 1fr/);
  assert.match(styles, /@media \(max-width: 700px\) \{[\s\S]*?\.home-waitlist-fields \.button \{[\s\S]*?width: 100%/);
});

test('Privacy Policy states the approved waitlist retention policy', () => {
  assert.match(privacy, /no more than 24 months while waiting or invited/i);
  assert.match(privacy, /within 30 days/i);
  assert.match(privacy, /legal requirement or active legal hold/i);
  assert.doesNotMatch(privacy, /\u2014/u);
});
