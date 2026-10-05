import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { chromium } from 'playwright';
import { installFlutterEngineFonts } from './flutter-engine-font-fixture.mjs';
import { localAuthBrowserServer } from './local-auth-browser-server.mjs';

const build = path.resolve(process.env.AUTH_WEB_ARTIFACT_DIR ?? 'build/web');
const output = path.resolve(
  process.env.PROFILE_VISUAL_QA_DIR ?? 'build/profile-visual-evidence',
);
const mime = {
  '.css': 'text/css',
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.otf': 'font/otf',
  '.png': 'image/png',
  '.ttf': 'font/ttf',
  '.wasm': 'application/wasm',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};
const accessToken = 'synthetic-profile-visual-token';
const owner = {
  id: '018f0000-0000-7000-8000-000000000001',
  email: 'profile-owner@example.invalid',
  displayName: 'Avery Morgan',
  bio: 'I help maintain a shared garden and make volunteer plans easy to follow.',
  role: 'user',
  subscription_tier: 'free',
  reputation_score: 0,
  created_at: '2026-08-01T00:00:00Z',
  last_login_at: '2026-08-01T00:00:00Z',
};
const publicMember = {
  id: '018f0000-0000-7000-8000-000000000002',
  displayName: 'Morgan Reed',
  bio: 'Sharing how our block works together.',
  handle: 'morgan-reed',
  subscriptionTier: 'free',
};
const hiddenMember = {
  id: '018f0000-0000-7000-8000-000000000003',
  displayName: 'Private Fixture Member',
  bio: 'PRIVATE_PROFILE_SENTINEL',
};

const post = ({ id, body, visibility, moderationState, publishedAt }) => ({
  id,
  authorId: owner.id,
  body,
  declaredCreationMode: 'human',
  moderationState,
  visibility,
  publishedAt,
  createdAt: '2026-09-28T12:00:00Z',
  updatedAt: '2026-09-28T12:00:00Z',
});

const firstPage = [
  post({
    id: '01900000-0000-7000-8000-000000000001',
    body: 'Garden planning notes and meeting times are open to everyone.',
    visibility: 'public',
    moderationState: 'allowed',
    publishedAt: '2026-09-28T12:00:00Z',
  }),
  post({
    id: '01900000-0000-7000-8000-000000000002',
    body: 'I am coordinating the Saturday watering rota with neighbors.',
    visibility: 'followers',
    moderationState: 'allowed',
    publishedAt: '2026-09-27T12:00:00Z',
  }),
  post({
    id: '01900000-0000-7000-8000-000000000003',
    body: 'Draft planting schedule for the next review cycle.',
    visibility: 'private',
    moderationState: 'under_review',
    publishedAt: null,
  }),
];
const secondPage = [
  post({
    id: '01900000-0000-7000-8000-000000000004',
    body: 'My private reminder to ask for tool donations.',
    visibility: 'private',
    moderationState: 'allowed',
    publishedAt: '2026-09-26T12:00:00Z',
  }),
];

const sizes = [
  { name: 'mobile', width: 390, height: 844 },
  { name: 'desktop', width: 1440, height: 960 },
];
const themes = ['light', 'dark'];
const selectedSizes = sizes.filter(({ name }) =>
  (process.env.PROFILE_VISUAL_VIEWPORTS ?? 'mobile,desktop').split(',').includes(name),
);
const selectedThemes = themes.filter((theme) =>
  (process.env.PROFILE_VISUAL_THEMES ?? 'light,dark').split(',').includes(theme),
);

test(
  'rendered own and other member profiles across themes and sizes',
  { timeout: 600000 },
  async (t) => {
    await mkdir(output, { recursive: true });
    const captures = [];
    const configResults = [];
    let browserVersion = null;

    for (const theme of selectedThemes) {
      for (const size of selectedSizes) {
        let session = false;
        let ownProfile = {
          id: owner.id,
          displayName: owner.displayName,
          bio: owner.bio,
          moderationState: 'allowed',
          publicVisibility: true,
          subscriptionTier: 'free',
        };
        let postsMode = 'empty';
        let postErrorsRemaining = 0;
        const apiCalls = [];
        const runtimeErrors = [];
        const ownerPostsCalls = [];

        const fixture = await localAuthBrowserServer(async (route) => {
          const request = route.request();
          const requestUrl = new URL(request.url());
          const requestHeaders = await request.allHeaders();

          if (requestUrl.hostname === 'app.lythaus.co') {
            let file = path.resolve(build, `.${requestUrl.pathname}`);
            assert.ok(file === build || file.startsWith(`${build}${path.sep}`));
            if (!path.extname(file)) file = path.join(build, 'index.html');
            try {
              return await route.fulfill({
                contentType:
                  mime[path.extname(file)] ?? 'application/octet-stream',
                body: await readFile(file),
              });
            } catch {
              return route.fulfill({ status: 404, body: 'Local artifact missing' });
            }
          }
          if (requestUrl.hostname !== 'api.lythaus.co') return route.abort();

          const headers = {
            'access-control-allow-origin': 'https://app.lythaus.co',
            'access-control-allow-credentials': 'true',
            'access-control-allow-methods': 'GET,POST,PATCH,DELETE,OPTIONS',
            'access-control-allow-headers':
              'Authorization, Content-Type, Idempotency-Key, X-Correlation-ID, X-Device-Rooted, X-Device-Emulator, X-Device-Debug, X-Live-Test-Mode, X-Lythaus-Auth-Transport',
          };
          if (request.method() === 'OPTIONS') {
            return route.fulfill({ status: 204, headers });
          }

          const entry = {
            method: request.method(),
            path: requestUrl.pathname,
            cursor: requestUrl.searchParams.get('cursor'),
            state: postsMode,
            authorization: requestHeaders.authorization ?? null,
          };
          apiCalls.push(entry);

          let status = 200;
          let body = { items: [], hasMore: false, nextCursor: null };
          if (requestUrl.pathname === '/api/auth/email') {
            session = true;
            headers['set-cookie'] =
              '__Host-lythaus_refresh=' +
              'f'.repeat(48) +
              '; Path=/; HttpOnly; Secure; SameSite=Strict';
            body = {
              accessToken,
              expiresIn: 900,
              sessionTransport: 'cookie-v1',
            };
          } else if (requestUrl.pathname === '/api/auth/refresh') {
            const cookie = requestHeaders.cookie ?? '';
            status = session && cookie.includes('__Host-lythaus_refresh=')
              ? 200
              : 401;
            body = status === 200
              ? { accessToken, expiresIn: 900, sessionTransport: 'cookie-v1' }
              : { error: 'refresh_token_invalid' };
          } else if (requestUrl.pathname === '/api/auth/userinfo') {
            status = session ? 200 : 401;
            body = session ? owner : { error: 'session_required' };
          } else if (requestUrl.pathname === '/api/auth/logout') {
            session = false;
            body = { state: 'signed_out' };
          } else if (requestUrl.pathname === '/api/users/me') {
            status = session ? 200 : 401;
            if (request.method() === 'PATCH' && status === 200) {
              ownProfile = { ...ownProfile, ...request.postDataJSON() };
            }
            body = status === 200
              ? { user: ownProfile }
              : { error: 'session_required' };
          } else if (requestUrl.pathname === '/api/users/me/posts') {
            status = session ? 200 : 401;
            ownerPostsCalls.push(entry);
            if (requestHeaders.authorization !== `Bearer ${accessToken}`) {
              status = 401;
            }
            if (status === 401) {
              body = { error: 'session_required' };
            } else if (postsMode === 'error' && postErrorsRemaining > 0) {
              postErrorsRemaining -= 1;
              status = 503;
              body = { error: 'temporary_unavailable' };
            } else if (postsMode === 'populated') {
              body = requestUrl.searchParams.get('cursor') === 'visual-page-2'
                ? { items: secondPage, nextCursor: null }
                : { items: firstPage, nextCursor: 'visual-page-2' };
            } else {
              body = { items: [], nextCursor: null };
            }
          } else if (requestUrl.pathname === `/api/users/${publicMember.id}`) {
            body = {
              user: {
                id: publicMember.id,
                displayName: publicMember.displayName,
                bio: publicMember.bio,
                handle: publicMember.handle,
                subscriptionTier: publicMember.subscriptionTier,
              },
            };
          } else if (requestUrl.pathname === `/api/users/${hiddenMember.id}`) {
            status = 404;
            body = { error: 'profile_not_found' };
          } else if (
            requestUrl.pathname === `/api/users/${publicMember.id}/follow`
          ) {
            body = { following: false, followerCount: 0 };
          } else if (
            ['/api/reputation/me', '/api/users/me/reputation'].includes(
              requestUrl.pathname,
            )
          ) {
            body = {
              userId: owner.id,
              level: 0,
              reputationLevel: 0,
              levelName: 'New',
              reputationStatus: 'active',
              reputationBand: 'new',
              policyVersion: 'reputation-v2.0.0',
              pillars: {
                accountability: 0,
                contribution: 0,
                conduct: 0,
                sourcing: 0,
                authenticity: 0,
                reviewReliability: 0,
              },
              promotionBlockers: [],
              evaluatedAt: null,
            };
          } else if (requestUrl.pathname === '/api/rewards/me/monthly') {
            body = {
              state: 'pending',
              reasonCode: 'approval_unavailable',
              effectiveMonth: null,
              currentLevel: null,
              sourceMonth: null,
              sourceScore: null,
              snapshot: { state: 'unavailable', reasonCode: 'approval_unavailable' },
              selection: { state: 'unavailable', reasonCode: 'approval_unavailable' },
            };
          } else if (
            ![
              '/api/feed/discover',
              '/api/custom-feeds',
              '/api/subscription/status',
            ].includes(requestUrl.pathname)
          ) {
            status = 404;
            body = { error: 'route_not_found' };
          }

          return route.fulfill({
            status,
            headers,
            contentType: 'application/json',
            body: JSON.stringify(body),
          });
        });

        const launchOptions = {
          headless: true,
          proxy: { server: fixture.proxy },
        };
        if (process.env.PROFILE_VISUAL_CHROMIUM_PATH) {
          launchOptions.executablePath = process.env.PROFILE_VISUAL_CHROMIUM_PATH;
          launchOptions.args = ['--no-sandbox', '--disable-dev-shm-usage'];
        }
        const browser = await chromium.launch(launchOptions);
        browserVersion ??= browser.version();
        let context;

        try {
          context = await browser.newContext({
            viewport: { width: size.width, height: size.height },
            deviceScaleFactor: 2,
            colorScheme: theme,
            serviceWorkers: 'block',
            ignoreHTTPSErrors: true,
          });
          await installFlutterEngineFonts(context);
          const page = await context.newPage();
          page.setDefaultTimeout(30000);
          page.on('pageerror', (error) => runtimeErrors.push(error.message));
          page.on('console', (message) => {
            if (message.type() !== 'error') return;
            const location = message.location();
            const expectedRefreshRejection =
              location.url === 'https://api.lythaus.co/api/auth/refresh' &&
              /^Failed to load resource:.*401/.test(message.text());
            const expectedProfileError =
              location.url.startsWith('https://api.lythaus.co/api/users/me/posts') &&
              /^Failed to load resource:.*503/.test(message.text());
            const expectedHiddenProfile =
              location.url === `https://api.lythaus.co/api/users/${hiddenMember.id}` &&
              /^Failed to load resource:.*404/.test(message.text());
            if (
              !expectedRefreshRejection &&
              !expectedProfileError &&
              !expectedHiddenProfile
            ) {
              runtimeErrors.push(message.text());
            }
          });

          async function activate() {
            await page
              .locator('flt-semantics-placeholder')
              .waitFor({ timeout: 60000 });
            await page
              .locator('flt-semantics-placeholder')
              .evaluate((element) => element.click());
          }

          async function openApp(route = '/') {
            await page.goto(`https://app.lythaus.co${route}`);
            await activate();
          }

          async function enter(field, value) {
            await field.click();
            await field.press('ControlOrMeta+A');
            await field.press('Backspace');
            if (value) await field.pressSequentially(value, { delay: 5 });
            assert.equal(await field.inputValue(), value);
          }

          async function signIn() {
            await page
              .getByRole('button', {
                name: 'Sign in with email',
                exact: true,
              })
              .waitFor();
            await enter(
              page.getByRole('textbox', { name: 'Email', exact: true }),
              owner.email,
            );
            await enter(page.locator('input[type=password]'), 'synthetic-password');
            await page
              .getByRole('button', {
                name: 'Sign in with email',
                exact: true,
              })
              .click();
            const profileTab = page
              .getByRole('button', { name: /^Profile(?:\b|$)/ })
              .first();
            await profileTab.waitFor({ timeout: 90000 });
            await profileTab.click();
            await page.getByRole('button', { name: /^Edit profile(?:\b|$)/ })
              .waitFor({ timeout: 90000 });
            await page.mouse.move(size.width / 2, size.height * 0.6);
            for (let attempt = 0; attempt < 8; attempt += 1) {
              if (
                (await page.getByText('Your posts', { exact: false }).count()) > 0
              ) {
                return;
              }
              await page.mouse.wheel(0, 420);
              await page.waitForTimeout(100);
            }
            t.diagnostic(
              JSON.stringify({
                route: page.url(),
                size,
                visibleSemantics: await page.locator('flt-semantics').allTextContents(),
                ownerPostsCalls,
                recentApiCalls: apiCalls.slice(-12),
              }),
            );
            await page.screenshot({
              path: path.join(output, `profile-debug-${theme}-${size.name}.png`),
              animations: 'disabled',
              scale: 'css',
            });
            await page.getByText('Your posts', { exact: false }).waitFor();
          }

          async function moveHeadingNearTop(text) {
            const labelled = page.locator(`flt-semantics[aria-label="${text}"]`);
            const target = (await labelled.count()) > 0
              ? labelled.first()
              : page.getByText(text, { exact: false }).first();
            for (let attempt = 0; attempt < 8; attempt += 1) {
              const box = (await target.count()) > 0
                ? await target.boundingBox()
                : null;
              if (box && box.y >= 24 && box.y < size.height * 0.34) return;
              await page.mouse.move(size.width / 2, size.height * 0.6);
              await page.mouse.wheel(0, box && box.y < 0 ? -320 : 420);
              await page.waitForTimeout(100);
            }
            const finalBox = await target.boundingBox();
            assert.ok(
              finalBox && finalBox.y >= 0 && finalBox.y < size.height,
              `Could not scroll ${text} into the viewport: ${JSON.stringify(finalBox)}`,
            );
          }

          async function screenshot(state, scale = 'css') {
            await page.evaluate(
              () =>
                new Promise((resolve) =>
                  requestAnimationFrame(() => requestAnimationFrame(resolve)),
                ),
            );
            await page.waitForTimeout(120);
            const name = `profile-${theme}-${size.name}-${state}.png`;
            const file = path.join(output, name);
            await page.screenshot({
              path: file,
              animations: 'disabled',
              scale,
            });
            const viewport = await page.evaluate(() => ({
              width: window.innerWidth,
              height: window.innerHeight,
              documentWidth: document.documentElement.scrollWidth,
              bodyWidth: document.body.scrollWidth,
            }));
            captures.push({
              name,
              theme,
              viewport: size.name,
              state,
              screenshotScale: scale,
              viewportMetrics: viewport,
            });
          }

          async function profileText() {
            return await page.locator('flt-semantics').evaluateAll((nodes) =>
              nodes
                .map((node) => [node.textContent, node.getAttribute('aria-label')]
                  .filter(Boolean)
                  .join('\n'))
                .join('\n'),
            );
          }

          function postCard(body) {
            const escaped = body.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            return page.getByRole('group', { name: new RegExp(escaped) });
          }

          await openApp();
          await signIn();
          const profileTab = page
            .getByRole('button', { name: /^Profile(?:\b|$)/ })
            .first();
          assert.ok(await profileTab.isVisible());
          assert.ok(await page.getByText(owner.displayName, { exact: true }).count() >= 1);
          assert.ok((await profileText()).includes(owner.bio));
          await page.mouse.wheel(0, -size.height * 8);
          await page.waitForTimeout(150);
          await screenshot('owner-empty-top');
          await moveHeadingNearTop('Your posts');
          assert.ok((await profileText()).includes('You have not posted yet.'));
          await screenshot('owner-empty');

          postsMode = 'populated';
          await page.getByRole('button', { name: 'Refresh profile' }).click();
          await postCard(firstPage[0].body).waitFor();
          await page.getByRole('checkbox', { name: 'Followers only' }).waitFor();
          await page
            .getByRole('group', { name: /Only you can see this while it is under review\./ })
            .waitFor();
          const ownText = await profileText();
          assert.doesNotMatch(ownText, /\b(?:Followers|Following)\s*[:=]\s*\d+/i);
          await moveHeadingNearTop('Your posts');
          await screenshot('owner-populated');

          const loadMore = page.getByRole('button', {
            name: 'Load more posts',
            exact: true,
          });
          await loadMore.focus();
          await page.keyboard.press('Enter');
          await postCard(secondPage[0].body).waitFor();
          await page.getByRole('group', { name: /Only you can see this\./ }).waitFor();
          await moveHeadingNearTop('Your posts');
          await screenshot('owner-populated-page-two');

          postsMode = 'error';
          postErrorsRemaining = 1;
          await page.getByRole('button', { name: 'Refresh profile' }).click();
          await page.getByRole('button', { name: 'Retry posts', exact: true }).waitFor();
          assert.ok(
            (await profileText()).includes(
              'Unable to load your posts. Your profile is still available.',
            ),
          );
          assert.equal(ownerPostsCalls.at(-1)?.state, 'error');
          const retry = page.getByRole('button', {
            name: 'Retry posts',
            exact: true,
          });
          await retry.focus();
          await screenshot('owner-error');

          postsMode = 'empty';
          await retry.focus();
          await page.keyboard.press('Enter');
          await page
            .getByText('You have not posted yet.', { exact: false })
            .waitFor();
          await moveHeadingNearTop('Your posts');
          await screenshot('owner-error-recovered');

          const ownerCallCount = ownerPostsCalls.length;
          await openApp(`/user/${publicMember.id}`);
          await page.getByText(publicMember.displayName, { exact: true }).waitFor();
          await page.getByText(publicMember.bio, { exact: true }).waitFor();
          await page.getByRole('button', { name: 'Follow', exact: true }).waitFor();
          await page.getByText('0 followers', { exact: true }).waitFor();
          assert.equal(
            await page.getByRole('link', { name: /followers|following/i }).count(),
            0,
          );
          const publicText = await profileText();
          assert.doesNotMatch(
            publicText,
            /Your posts|Edit profile|Activity & Audit Log|PRIVATE_PROFILE_SENTINEL|Garden planning notes|watering rota|Draft planting schedule|private reminder|profile-owner@example\.invalid|Followers\s*[:=]\s*\d+|Following\s*[:=]\s*\d+/i,
          );
          assert.equal(ownerPostsCalls.length, ownerCallCount);
          await screenshot('other-profile-public');
          const otherProfileUrl = page.url();
          await page.getByRole('button', { name: 'Back', exact: true }).click();
          await page.waitForFunction(
            (currentUrl) => window.location.href !== currentUrl,
            otherProfileUrl,
            { timeout: 10000 },
          );
          const ownerCallCountAfterBack = ownerPostsCalls.length;

          await openApp(`/user/${hiddenMember.id}`);
          await page.getByText('Unable to load profile', { exact: true }).waitFor();
          await page.getByRole('button', { name: 'Retry', exact: true }).waitFor();
          const hiddenText = await profileText();
          assert.doesNotMatch(
            hiddenText,
            /Private Fixture Member|PRIVATE_PROFILE_SENTINEL|Your posts|Edit profile|Activity & Audit Log/,
          );
          assert.equal(ownerPostsCalls.length, ownerCallCountAfterBack);
          await screenshot('other-profile-private-hidden');

          await openApp('/?tab=profile');
          await moveHeadingNearTop('Your posts');
          postsMode = 'populated';
          await page.getByRole('button', { name: 'Refresh profile' }).click();
          await postCard(firstPage[0].body).waitFor();
          await page.setViewportSize({
            width: Math.floor(size.width / 2),
            height: Math.floor(size.height / 2),
          });
          await page.waitForTimeout(300);
          await screenshot('owner-populated-large-text-top', 'device');
          const zoomViewport = await page.evaluate(() => ({
            width: window.innerWidth,
            height: window.innerHeight,
          }));
          const zoomedNavBox = await page
            .getByRole('button', { name: /^Profile(?:\b|$)/ })
            .first()
            .boundingBox();
          const contentBottom = zoomedNavBox?.y ?? zoomViewport.height;
          const zoomedFirstPost = postCard(firstPage[0].body);
          let zoomedPostBox = null;
          for (let attempt = 0; attempt < 12; attempt += 1) {
            zoomedPostBox = await zoomedFirstPost
              .boundingBox({ timeout: 500 })
              .catch(() => null);
            if (
              zoomedPostBox &&
              zoomedPostBox.y < contentBottom - 140 &&
              zoomedPostBox.y + zoomedPostBox.height > 64
            ) {
              break;
            }
            await page.mouse.move(
              Math.floor(zoomViewport.width / 2),
              Math.floor(zoomViewport.height * 0.75),
            );
            await page.mouse.wheel(
              0,
              Math.max(220, Math.floor(zoomViewport.height * 0.7)),
            );
            await page.waitForTimeout(120);
          }
          zoomedPostBox = await zoomedFirstPost.boundingBox({ timeout: 1000 }).catch(() => null);
          assert.ok(
            zoomedPostBox &&
              zoomedPostBox.y < contentBottom - 140 &&
              zoomedPostBox.y + zoomedPostBox.height > 64,
            `The timeline should be reachable at 200% zoom: ${JSON.stringify(zoomedPostBox)}`,
          );
          const largeTextContent = await profileText();
          assert.ok(largeTextContent.includes(firstPage[0].body));
          assert.ok(largeTextContent.includes(owner.displayName));
          const largeTextMetrics = await page.evaluate(() => ({
            viewportWidth: window.innerWidth,
            documentWidth: document.documentElement.scrollWidth,
            bodyWidth: document.body.scrollWidth,
            pixelRatio: window.devicePixelRatio,
          }));
          assert.ok(
            largeTextMetrics.documentWidth <= largeTextMetrics.viewportWidth + 1,
              `Horizontal overflow at 200% browser zoom: ${JSON.stringify(largeTextMetrics)}`,
          );
          await screenshot('owner-populated-large-text-200', 'device');

          configResults.push({
            theme,
            viewport: size.name,
            ownerPostsRequests: ownerPostsCalls.length,
            ownerPostQueries: ownerPostsCalls.map(({ cursor, state }) => ({
              cursor,
              state,
            })),
            errors: [...runtimeErrors],
            unhandledApiPaths: apiCalls
              .filter(({ path: requestPath, method }) => {
                return (
                  requestPath !== '/api/auth/email' &&
                  requestPath !== '/api/auth/refresh' &&
                  requestPath !== '/api/auth/userinfo' &&
                  requestPath !== '/api/auth/logout' &&
                  requestPath !== '/api/users/me' &&
                  requestPath !== '/api/users/me/posts' &&
                  requestPath !== `/api/users/${publicMember.id}` &&
                  requestPath !== `/api/users/${publicMember.id}/follow` &&
                  requestPath !== `/api/users/${hiddenMember.id}` &&
                  requestPath !== '/api/reputation/me' &&
                  requestPath !== '/api/users/me/reputation' &&
                  requestPath !== '/api/rewards/me/monthly' &&
                  ![
                    '/api/feed/discover',
                    '/api/custom-feeds',
                    '/api/subscription/status',
                  ].includes(requestPath) &&
                  method !== 'OPTIONS'
                );
              })
              .map(({ method, path: requestPath }) => `${method} ${requestPath}`),
          });
        } finally {
          await context?.close();
          await browser.close();
          await fixture.close();
        }
      }
    }

    await writeFile(
      path.join(output, 'profile-visual-qa-manifest.json'),
      JSON.stringify(
        {
          sourceCommit: process.env.QA_COMMIT ?? null,
          syntheticOnly: true,
          browser: 'Chromium',
          browserVersion,
          screenshots: captures,
          configurations: configResults,
          limitations: [
            'Large-text check uses a 200% browser-zoom viewport with device-pixel ratio 2; native OS text-size and assistive-technology behavior are not covered.',
            'No real account, live API, or production data was used.',
          ],
        },
        null,
        2,
      ),
    );
    const expectedCaptures = selectedThemes.length * selectedSizes.length * 10;
    assert.equal(captures.length, expectedCaptures, 'Every profile state screenshot must be captured');
    assert.deepEqual(
      configResults.flatMap(({ errors }) => errors),
      [],
      'Rendered profile routes must not raise uncaught runtime errors',
    );
  },
);
