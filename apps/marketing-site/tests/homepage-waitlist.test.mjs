import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve(import.meta.dirname, '..');
const homepage = fs.readFileSync(path.join(root, 'src/pages/index.astro'), 'utf8');
const layout = fs.readFileSync(path.join(root, 'src/layouts/BaseLayout.astro'), 'utf8');
const privacy = fs.readFileSync(path.join(root, 'src/pages/privacy/index.astro'), 'utf8');
const styles = fs.readFileSync(path.join(root, 'src/styles/global.css'), 'utf8');
const homePitchStyles = fs.readFileSync(path.join(root, 'src/styles/home-pitch.css'), 'utf8');
const headers = fs.readFileSync(path.join(root, 'public/_headers'), 'utf8');
const manifest = fs.readFileSync(path.join(root, 'public/site.webmanifest'), 'utf8');

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

test('homepage public copy matches the living internet pitch and stays launch safe', () => {
  const publicSource = `${homepage}\n${layout}`;
  const visibleCopy = publicSource.replace(/<script[\s\S]*?<\/script>/giu, '');
  assert.doesNotMatch(visibleCopy, /\u2014/u);
  assert.doesNotMatch(visibleCopy, /lime|neon green|purple gradient|PlanetScale|Hyperdrive|Cloudflare|C2PA|stylometric|policy engine|appeal threshold|moderation weight/i);
  for (const phrase of [
    'For the living internet.',
    'Lythaus is a human-first social platform for public-interest conversation',
    '01 / THE PROBLEM',
    '02 / HUMAN FIRST',
    '03 / THE PLATFORM',
    '04 / AUTHORSHIP',
    '05 / DISCOVERY',
    '06 / REPUTATION',
    '07 / ACCOUNTABILITY',
    '08 / PUBLIC INTEREST',
    '09 / EDITORIAL',
    '10 / WHY LYTHAUS',
    'Human-authored',
    'AI-assisted',
    'AI-generated',
    'Under review',
    'Join the private beta',
  ]) assert.match(homepage, new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.doesNotMatch(homepage, /The human internet is worth protecting\./);
  assert.doesNotMatch(homepage, /app\.lythaus\.co|Guest Preview|News Board/i);
  const retiredUserFacingNames = [String.fromCharCode(65, 115, 111, 114, 97), String.fromCharCode(65, 122, 117, 114, 101)];
  assert.doesNotMatch(visibleCopy, new RegExp(retiredUserFacingNames.join('|'), 'i'));
  assert.equal((homepage.match(/For the living internet\./g) ?? []).length, 2);
  assert.match(styles, /--accent: #f2c98d/i);
});

test('homepage story sections use the approved narrative labels and anchors', () => {
  for (const label of [
    '01 / THE PROBLEM',
    '02 / HUMAN FIRST',
    '03 / THE PLATFORM',
    '04 / AUTHORSHIP',
    '05 / DISCOVERY',
    '06 / REPUTATION',
    '07 / ACCOUNTABILITY',
    '08 / PUBLIC INTEREST',
    '09 / EDITORIAL',
    '10 / WHY LYTHAUS',
  ]) assert.match(homepage, new RegExp(label));
  for (const anchor of ['problem', 'human-first', 'platform', 'authorship', 'discovery', 'reputation', 'accountability', 'public-interest', 'editorial', 'why-lythaus', 'waitlist']) {
    assert.match(homepage, new RegExp(`id="${anchor}"`));
  }
  assert.doesNotMatch(homepage, /pitch-section-meta/);
});

test('homepage story content is direct and does not claim a live product preview', () => {
  assert.match(homepage, /class="hero hero--story"/);
  assert.match(homepage, /class="story-section"/);
  assert.match(homepage, /Your feed should not be a black box\./);
  assert.match(homepage, /Credibility should be earned, not purchased\./);
  assert.doesNotMatch(homepage, /href="https?:\/\/app\.lythaus\.co/);
});

test('homepage story content remains visible without a JavaScript reveal dependency', () => {
  assert.match(homepage, /class="story-section/);
  assert.match(homePitchStyles, /\.story-section/);
  assert.doesNotMatch(homePitchStyles, /\.story-section[^}]*opacity:\s*0/);
});

test('shared layout provides an accessible mobile navigation fallback', () => {
  assert.match(layout, /data-mobile-nav-toggle/);
  assert.match(layout, /aria-controls="mobile-nav-panel"/);
  assert.match(layout, /data-mobile-nav-panel/);
  assert.match(layout, /aria-label="Mobile navigation"/);
  assert.match(layout, /event\.key === 'Escape'/);
  assert.match(layout, /mobile-nav-open/);
  assert.match(layout, /focusable\[focusable\.length - 1\]/);
  assert.match(layout, /const getLayoutTop = \(element\) =>/);
  assert.match(layout, /target\.classList\.add\('is-visible'\)/);
  assert.match(layout, /getLayoutTop\(target\) - headerOffset/);
  assert.match(layout, /window\.scrollTo\(\{ top, behavior \}/);
  assert.match(layout, /document\.fonts\?\.ready/);
  assert.match(layout, /window\.history\.pushState/);
  assert.match(layout, /event\.preventDefault\(\)/);
  assert.match(styles, /html:not\(\.js-enabled\) \.mobile-nav-panel/);
  assert.match(styles, /min-height: 44px/);
});

test('homepage hero carries the living internet signal', () => {
  assert.match(homepage, /class="hero hero--story"/);
  assert.match(homepage, /<h1 id="hero-title">For the living internet\.<\/h1>/);
  assert.match(homepage, /class="hero-card hero-card--signal"/);
  assert.match(homepage, /Human authorship\.<br \/>Accountable participation\.<br \/>Discovery you can understand\./);
  assert.doesNotMatch(homepage, /pitch-wordmark|pitchLighthouseSweep|pitchLighthouseCore/);
});

test('homepage navigation and preview tabs have stable cross-browser hit areas', () => {
  assert.match(homePitchStyles, /grid-template-columns: minmax\(0, 1fr\) auto minmax\(0, 1fr\)/);
  assert.match(homePitchStyles, /\.home-page \.site-header::after[\s\S]*pointer-events: none/);
  assert.match(homePitchStyles, /\.home-page \.site-nav a[\s\S]*display: inline-flex[\s\S]*min-height: 44px/);
  assert.match(homePitchStyles, /\.pitch-preview-tabs button[\s\S]*min-height: 44px/);
  assert.match(homePitchStyles, /touch-action: manipulation/);
});

test('shared layout declares Lythaus browser and home-screen assets', () => {
  assert.match(layout, /<link rel="icon" href="\/favicon\.ico" sizes="any" \/>/);
  assert.match(layout, /<link rel="icon" type="image\/png" href="\/favicon\.png" sizes="64x64" \/>/);
  assert.match(layout, /<link rel="manifest" href="\/site\.webmanifest" \/>/);
  assert.match(layout, /<link rel="apple-touch-icon" type="image\/png" href="\/apple-touch-icon\.png" sizes="180x180" \/>/);
  assert.ok(fs.existsSync(path.join(root, 'public/favicon.ico')));
  assert.ok(fs.existsSync(path.join(root, 'public/favicon.png')));
  assert.ok(fs.existsSync(path.join(root, 'public/apple-touch-icon.png')));

  const appManifest = JSON.parse(manifest);
  assert.equal(appManifest.name, 'Lythaus');
  assert.equal(appManifest.short_name, 'Lythaus');
  assert.equal(appManifest.start_url, '/');
  assert.equal(appManifest.scope, '/');
  assert.equal(appManifest.display, 'standalone');
  assert.equal(appManifest.theme_color, '#070706');
  assert.equal(appManifest.background_color, '#070706');
  assert.deepEqual(appManifest.icons, [
    { src: '/icons/lythaus-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
    { src: '/icons/lythaus-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
    { src: '/icons/lythaus-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
  ]);
  for (const [file, size] of [
    ['public/icons/lythaus-192.png', 192],
    ['public/icons/lythaus-512.png', 512],
    ['public/icons/lythaus-512-maskable.png', 512],
  ]) {
    const png = fs.readFileSync(path.join(root, file));
    assert.equal(png.readUInt32BE(16), size);
    assert.equal(png.readUInt32BE(20), size);
  }
});

test('Turnstile CSP is narrowly allowlisted', () => {
  assert.match(headers, /script-src[^\n]+https:\/\/challenges\.cloudflare\.com/);
  assert.match(headers, /frame-src https:\/\/challenges\.cloudflare\.com/);
  assert.doesNotMatch(headers, /script-src[^\n]+\*/);
});

test('homepage layout remains bounded at desktop and 390 pixel widths', () => {
  assert.match(homePitchStyles, /\.pitch-waitlist \{[\s\S]*grid-template-columns: minmax\(0, 0\.9fr\) minmax\(380px, 0\.75fr\)/);
  assert.match(homePitchStyles, /\.pitch-waitlist \{[\s\S]*min-width: 0/);
  assert.match(homePitchStyles, /@media \(max-width: 700px\) \{[\s\S]*?\.pitch-waitlist \.home-waitlist-fields \{[\s\S]*?grid-template-columns: 1fr/);
  assert.match(homePitchStyles, /@media \(max-width: 700px\) \{[\s\S]*?\.pitch-waitlist \.home-waitlist-fields \.button \{[\s\S]*?width: 100%/);
  assert.match(homePitchStyles, /padding: clamp\(90px, 10vw, 145px\) 0/);
  assert.match(homePitchStyles, /\.pitch-section \{\s*padding: 78px 0/);
  assert.doesNotMatch(homePitchStyles, /font-size: 9px/);
});

test('Privacy Policy states the approved waitlist retention policy', () => {
  assert.match(privacy, /no more than 24 months while waiting or invited/i);
  assert.match(privacy, /within 30 days/i);
  assert.match(privacy, /legal requirement or active legal hold/i);
  assert.doesNotMatch(privacy, /\u2014/u);
});
