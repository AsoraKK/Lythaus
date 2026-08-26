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

test('homepage public copy matches the human-first pitch and stays launch safe', () => {
  const publicSource = `${homepage}\n${layout}`;
  const visibleCopy = publicSource.replace(/<script[\s\S]*?<\/script>/giu, '');
  assert.doesNotMatch(visibleCopy, /\u2014/u);
  assert.doesNotMatch(visibleCopy, /lime|neon green|purple gradient|PlanetScale|Hyperdrive|Cloudflare|C2PA|stylometric|confidence score|policy engine|appeal threshold|moderation weight/i);
  assert.match(homepage, /The human internet is worth protecting\./);
  assert.match(homepage, /Built for humans first\./);
  assert.match(homepage, /Lythaus is a human-first, public-interest platform built for genuine human interaction\./);
  assert.match(homepage, /Algorithms for relevance, not addiction\./);
  assert.match(homepage, /Reputation is earned\./);
  assert.match(homepage, /Member content is not sold or repurposed to train generative models\./);
  assert.match(homepage, /Join the waitlist/);
  assert.match(homepage, /Join Lythaus early\./);
  assert.match(homepage, /Preview how Lythaus works\./);
  assert.match(homepage, /Illustrative UI only\. No account actions or live content are available here\./);
  assert.match(homepage, /Human-authored/);
  assert.match(homepage, /AI-assisted/);
  assert.match(homepage, /Under review/);
  assert.doesNotMatch(homepage, /Enter a live, read-only version of Lythaus/);
  assert.doesNotMatch(homepage, /app\.lythaus\.co|Guest Preview|News Board/i);
  const retiredUserFacingNames = [String.fromCharCode(65, 115, 111, 114, 97), String.fromCharCode(65, 122, 117, 114, 101)];
  assert.doesNotMatch(visibleCopy, new RegExp(retiredUserFacingNames.join('|'), 'i'));
  assert.equal((homepage.match(/The human internet is worth protecting\./g) ?? []).length, 1);
  assert.equal((homepage.match(/Algorithms for relevance, not addiction\./g) ?? []).length, 1);
  assert.match(styles, /--accent: #f2c98d/i);
});

test('homepage section numbering is sequential and the waitlist is unnumbered', () => {
  const numbers = [...homepage.matchAll(/(?:pitch-intro-meta|pitch-section-meta)[^>]*>(\d{2}) \/ /g)].map((match) => match[1]);
  assert.deepEqual(numbers, ['00', '01', '02', '03', '04', '05', '06', '07', '08']);
  assert.doesNotMatch(homepage, /09 \/|10 \/|11 \/|12 \/|13 \//);
  assert.doesNotMatch(homepage, /pitch-waitlist[^>]*>[\s\S]*?\d{2} \/ /);
});

test('Experience is an explicit local preview with keyboard-oriented controls', () => {
  assert.match(homepage, /data-preview/);
  assert.match(homepage, /role="tablist"/);
  assert.match(homepage, /data-preview-tab="discovery"/);
  assert.match(homepage, /data-preview-tab="authorship"/);
  assert.match(homepage, /data-preview-tab="controls"/);
  assert.match(homepage, /data-preview-control aria-pressed/);
  assert.match(homepage, /No feed request is made\./);
  assert.match(homepage, /ArrowRight.*ArrowLeft.*Home.*End/s);
  assert.doesNotMatch(homepage, /href="https?:\/\/app\.lythaus\.co/);
});

test('homepage reveal enhancement has a visible-content fallback', () => {
  assert.match(homepage, /pitch-reveal-pending/);
  assert.match(homepage, /pitch-opening-resolved/);
  assert.match(homepage, /IntersectionObserver/);
  assert.match(homepage, /prefers-reduced-motion/);
  assert.match(homePitchStyles, /\.pitch-section\.pitch-reveal-pending/);
  assert.doesNotMatch(homePitchStyles, /\.pitch-section\[data-pitch-reveal\],[\s\S]{0,120}opacity: 0/);
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

test('homepage opening resolves the Lythaus letters without a separate point light', () => {
  assert.match(homepage, /class="pitch-wordmark"/);
  assert.match(homepage, /--letter-index: 0/);
  assert.match(homepage, /--letter-index: 6/);
  assert.match(homePitchStyles, /@keyframes pitchLetterResolve/);
  assert.doesNotMatch(homepage, /--light-delay/);
  assert.doesNotMatch(homePitchStyles, /pitchLightPoint|\.pitch-letter::before/);
  assert.match(homePitchStyles, /prefers-reduced-motion/);
  assert.match(homePitchStyles, /animation-delay: var\(--letter-delay\)/);
  assert.match(homePitchStyles, /animation: pitchLetterResolve 540ms linear forwards/);
  assert.match(homePitchStyles, /@keyframes pitchLetterResolve[\s\S]*?18%[\s\S]*?50%[\s\S]*?64%[\s\S]*?100%/);
  assert.match(homePitchStyles, /@keyframes pitchLetterResolveMobile[\s\S]*?20%[\s\S]*?50%[\s\S]*?64%[\s\S]*?100%/);
  assert.match(homePitchStyles, /animation-timing-function: cubic-bezier\(0\.7, 0, 1, 1\)/);
  assert.match(homePitchStyles, /animation-timing-function: cubic-bezier\(0\.4, 0, 0\.2, 1\)/);
  assert.match(homePitchStyles, /animation: pitchCopyReveal 520ms ease 860ms forwards/);
  assert.match(homePitchStyles, /animation: none/);
  assert.match(homePitchStyles, /filter: none;\s*text-shadow: none;/);
  assert.doesNotMatch(homepage, /pitch-scroll-cue|pitchCueReveal|pitchCueMove/);
  assert.doesNotMatch(homePitchStyles, /pitch-scroll-cue|pitchCueReveal|pitchCueMove/);
});

test('homepage navigation and preview tabs have stable cross-browser hit areas', () => {
  assert.match(homePitchStyles, /grid-template-columns: minmax\(0, 1fr\) auto minmax\(0, 1fr\)/);
  assert.match(homePitchStyles, /\.home-page \.site-header::after[\s\S]*pointer-events: none/);
  assert.match(homePitchStyles, /\.home-page \.site-nav a[\s\S]*display: inline-flex[\s\S]*min-height: 44px/);
  assert.match(homePitchStyles, /\.pitch-preview-tabs button[\s\S]*min-height: 44px/);
  assert.match(homePitchStyles, /touch-action: manipulation/);
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
