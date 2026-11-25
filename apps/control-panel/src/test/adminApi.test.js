import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockOrigin = 'https://admin.lythaus.co';

beforeEach(() => {
  Object.defineProperty(globalThis, 'window', {
    value: { location: { origin: mockOrigin } },
    writable: true,
    configurable: true,
  });
});

afterEach(() => {
  vi.resetModules();
  vi.restoreAllMocks();
});

describe('adminApi same-origin requests', () => {
  it('always uses the same-origin /api/admin base path', async () => {
    const { getAdminApiUrl } = await import('../api/adminApi.js');
    expect(getAdminApiUrl()).toBe('/api/admin');
  });

  it('builds credentialed no-store requests without browser API overrides', async () => {
    let capturedUrl;
    let capturedOptions;
    globalThis.fetch = vi.fn(async (url, options) => {
      capturedUrl = url;
      capturedOptions = options;
      return { ok: true, text: async () => '{"status":"ok"}' };
    });
    const { adminRequest } = await import('../api/adminApi.js');
    await adminRequest('waitlist', { query: { limit: 50, cursor: 'opaque' } });
    expect(capturedUrl).toBe(`${mockOrigin}/api/admin/waitlist?limit=50&cursor=opaque`);
    expect(capturedOptions.credentials).toBe('include');
    expect(capturedOptions.cache).toBe('no-store');
  });

  it('sends JSON mutations to the same origin', async () => {
    let capturedUrl;
    let capturedOptions;
    globalThis.fetch = vi.fn(async (url, options) => {
      capturedUrl = url;
      capturedOptions = options;
      return { ok: true, text: async () => '{}' };
    });
    const { adminRequest } = await import('../api/adminApi.js');
    await adminRequest('waitlist/01900000-0000-7000-8000-000000000001/status', {
      method: 'POST', body: { status: 'invited' },
    });
    expect(capturedUrl).toBe(`${mockOrigin}/api/admin/waitlist/01900000-0000-7000-8000-000000000001/status`);
    expect(capturedOptions.headers['Content-Type']).toBe('application/json');
    expect(capturedOptions.body).toBe('{"status":"invited"}');
  });

  it('accepts a build identity only from the same isolated health response with a valid version and source', async () => {
    const { adminRequest, isolatedAdminOrigin } = await import('../api/adminApi.js');
    const version = '33333333-3333-4333-8333-333333333333';
    const source = 'a'.repeat(40);
    const payload = {error:'admin_request_failed', workerBuild:{versionId:version, sourceSha:source}};
    for (const [origin, path, id, sha, responseUrl, redirected, accepted] of [
      [isolatedAdminOrigin, 'health', version, source, isolatedAdminOrigin + '/api/admin/health', false, true],
      [isolatedAdminOrigin, 'health', 'private', source, isolatedAdminOrigin + '/api/admin/health', false, false],
      [isolatedAdminOrigin, 'health', version, 'private', isolatedAdminOrigin + '/api/admin/health', false, false],
      [isolatedAdminOrigin, 'health', version, source, isolatedAdminOrigin + '/api/admin/health', true, false],
      [isolatedAdminOrigin, 'health', version, source, 'https://other.invalid/', false, false],
      [isolatedAdminOrigin, 'moderation/cases', version, source, isolatedAdminOrigin + '/api/admin/moderation/cases', false, false],
      [mockOrigin, 'health', version, source, mockOrigin + '/api/admin/health', false, false],
    ]) {
      window.location.origin = origin;
      globalThis.fetch = vi.fn(async () => ({
        ok:false, status:500, url:responseUrl, redirected,
        headers:new Headers({'x-lythaus-worker-version':id,'x-lythaus-source-sha':sha}),
        text:async () => JSON.stringify(payload),
      }));
      let received;
      try { await adminRequest(path); } catch (failure) { received = failure; }
      expect(received?.status).toBe(500);
      expect(received.workerBuild).toEqual(accepted ? {versionId:version, sourceSha:source} : undefined);
    }
  });
});
