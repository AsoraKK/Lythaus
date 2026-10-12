export class ContentFixtureTargetBlocked extends Error {}

export function requireLocalContentFixtureTarget(apiBase) {
  const url = new URL(apiBase);
  if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
      || !['http:', 'https:'].includes(url.protocol)) {
    throw new ContentFixtureTargetBlocked('content_fixtures_require_disposable_local_target');
  }
}
