import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockOrigin = 'https://admin.lythaus.co';

function createStorageMock(initial = {}) {
  const store = new Map(Object.entries(initial));

  return {
    getItem: vi.fn((key) => (store.has(key) ? store.get(key) : null)),
    setItem: vi.fn((key, value) => {
      store.set(key, String(value));
    }),
    removeItem: vi.fn((key) => {
      store.delete(key);
    }),
    clear: vi.fn(() => {
      store.clear();
    }),
    dump() {
      return Object.fromEntries(store.entries());
    }
  };
}

function installWindow({ localEntries = {}, sessionEntries = {} } = {}) {
  const localStorage = createStorageMock(localEntries);
  const sessionStorage = createStorageMock(sessionEntries);

  Object.defineProperty(globalThis, 'window', {
    value: {
      location: {
        origin: mockOrigin,
        href: `${mockOrigin}/`
      },
      localStorage,
      sessionStorage,
      dispatchEvent: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn()
    },
    writable: true,
    configurable: true
  });

  return { localStorage, sessionStorage };
}

beforeEach(() => {
  installWindow();
});
afterEach(() => {
  vi.resetModules();
  vi.restoreAllMocks();
});

describe('adminApi URL construction', () => {
  describe('resolveToAbsoluteUrl', () => {
    it('normalizes the absolute API root to the admin dispatcher', async () => {
      window.localStorage.setItem('controlPanelAdminApiUrl', 'https://admin-api.lythaus.co/api');

      const { getAbsoluteAdminApiUrl } = await import('../api/adminApi.js');
      expect(getAbsoluteAdminApiUrl()).toBe('https://admin-api.lythaus.co/api/admin');
    });

    it('resolves relative paths against window.location.origin', async () => {
      const { getAbsoluteAdminApiUrl } = await import('../api/adminApi.js');
      expect(getAbsoluteAdminApiUrl()).toBe('https://admin-api.lythaus.co/api/admin');
    });

    it('handles relative paths from localStorage', async () => {
      window.localStorage.setItem('controlPanelAdminApiUrl', '/api/v2/admin');

      const { getAbsoluteAdminApiUrl } = await import('../api/adminApi.js');
      expect(getAbsoluteAdminApiUrl()).toBe(`${mockOrigin}/api/v2/admin`);
    });
  });

  describe('buildUrl via adminRequest', () => {
    it('builds the correct URL for moderation test', async () => {
      const { adminRequest } = await import('../api/adminApi.js');

      let capturedUrl = null;
      let capturedOptions = null;
      globalThis.fetch = vi.fn(async (url, options) => {
        capturedUrl = url;
        capturedOptions = options;
        return {
          ok: true,
          text: async () => '{"status":"ok"}'
        };
      });

      await adminRequest('moderation/cases', { method: 'GET' });

      expect(capturedUrl).toBe('https://admin-api.lythaus.co/api/admin/moderation/cases');
      expect(capturedOptions.credentials).toBe('include');
    });

    it('handles paths without leading slash', async () => {
      let capturedUrl = null;
      globalThis.fetch = vi.fn(async (url) => {
        capturedUrl = url;
        return {
          ok: true,
          text: async () => '{"status":"ok"}'
        };
      });

      const { adminRequest } = await import('../api/adminApi.js');
      await adminRequest('moderation/cases', { method: 'GET' });

      expect(capturedUrl).toBe('https://admin-api.lythaus.co/api/admin/moderation/cases');
    });

    it('handles a base URL with trailing slash', async () => {
      window.localStorage.setItem('controlPanelAdminApiUrl', '/api/admin/');

      let capturedUrl = null;
      globalThis.fetch = vi.fn(async (url) => {
        capturedUrl = url;
        return {
          ok: true,
          text: async () => '{"status":"ok"}'
        };
      });

      const { adminRequest } = await import('../api/adminApi.js');
      await adminRequest('/config', { method: 'GET' });

      expect(capturedUrl).toBe(`${mockOrigin}/api/admin/config`);
    });

    it('preserves query parameters', async () => {
      let capturedUrl = null;
      globalThis.fetch = vi.fn(async (url) => {
        capturedUrl = url;
        return {
          ok: true,
          text: async () => '{"items":[]}'
        };
      });

      const { adminRequest } = await import('../api/adminApi.js');
      await adminRequest('/users', {
        method: 'GET',
        query: { limit: 10, offset: 20 }
      });

      const parsedUrl = new URL(capturedUrl);
      expect(parsedUrl.pathname).toBe('/api/admin/users');
      expect(parsedUrl.searchParams.get('limit')).toBe('10');
      expect(parsedUrl.searchParams.get('offset')).toBe('20');
    });

    it('works with an absolute admin API URL', async () => {
      const directApiUrl = 'https://admin-api.lythaus.co/api';
      window.localStorage.setItem('controlPanelAdminApiUrl', directApiUrl);

      let capturedUrl = null;
      globalThis.fetch = vi.fn(async (url) => {
        capturedUrl = url;
        return {
          ok: true,
          text: async () => '{"status":"ok"}'
        };
      });

      const { adminRequest } = await import('../api/adminApi.js');
      await adminRequest('moderation/cases', { method: 'GET' });

      expect(capturedUrl).toBe(`${directApiUrl}/admin/moderation/cases`);
    });
  });

  describe('edge cases', () => {
    it('does not produce double slashes in URL', async () => {
      const testCases = [
        { base: '/api/admin', path: '/test', expected: '/api/admin/test' },
        { base: '/api/admin/', path: '/test', expected: '/api/admin/test' },
        { base: '/api/admin/', path: 'test', expected: '/api/admin/test' },
        { base: '/api/admin', path: 'test', expected: '/api/admin/test' }
      ];

      for (const { base, path, expected } of testCases) {
        vi.resetModules();
        installWindow({ localEntries: { controlPanelAdminApiUrl: base } });

        let capturedUrl = null;
        globalThis.fetch = vi.fn(async (url) => {
          capturedUrl = url;
          return {
            ok: true,
            text: async () => '{}'
          };
        });

        const { adminRequest } = await import('../api/adminApi.js');
        await adminRequest(path, { method: 'GET' });

        const parsedUrl = new URL(capturedUrl);
        expect(parsedUrl.pathname).toBe(expected);
      }
    });

    it('filters out empty query parameters', async () => {
      let capturedUrl = null;
      globalThis.fetch = vi.fn(async (url) => {
        capturedUrl = url;
        return {
          ok: true,
          text: async () => '{}'
        };
      });

      const { adminRequest } = await import('../api/adminApi.js');
      await adminRequest('/users', {
        method: 'GET',
        query: {
          limit: 10,
          search: '',
          filter: null,
          page: undefined,
          active: 'true'
        }
      });

      const parsedUrl = new URL(capturedUrl);
      expect(parsedUrl.searchParams.get('limit')).toBe('10');
      expect(parsedUrl.searchParams.get('active')).toBe('true');
      expect(parsedUrl.searchParams.has('search')).toBe(false);
      expect(parsedUrl.searchParams.has('filter')).toBe(false);
      expect(parsedUrl.searchParams.has('page')).toBe(false);
    });
  });
});
