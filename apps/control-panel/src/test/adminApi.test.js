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
});
