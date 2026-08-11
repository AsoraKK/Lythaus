import * as fs from 'node:fs';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import fetch, { Response } from 'cross-fetch';

type HttpMethod = 'get' | 'post' | 'delete';

interface RequestOptions {
  method: HttpMethod;
  pathKey: string;
  auth?: boolean;
  query?: Record<string, string | number | undefined>;
  body?: Record<string, unknown>;
}

const spec = JSON.parse(
  fs.readFileSync(path.join(process.cwd(), 'api/openapi/dist/openapi.json'), 'utf-8')
);
const requireLiveContracts = process.env.REQUIRE_LIVE_CONTRACTS === 'true';
const server = process.env.ALPHA_API_BASE_URL
  ? process.env.ALPHA_API_BASE_URL
  : process.env.STAGING_DOMAIN
  ? `https://${process.env.STAGING_DOMAIN}/api`
  : requireLiveContracts
  ? spec.servers?.[0]?.url
  : undefined;
const jwt = process.env.STAGING_SMOKE_TOKEN;

const ajv = new Ajv({ strict: false, allErrors: true });
addFormats(ajv);

const validatorCache = new Map<string, import('ajv').ValidateFunction>();
const baseUrl = server ? server.replace(/\/?$/, '') : undefined;
const REQUEST_TIMEOUT_MS = Number(process.env.CONTRACT_TIMEOUT_MS ?? 5000);
const LIVE_REACHABILITY_ATTEMPTS = requireLiveContracts ? 3 : 1;
const LIVE_REACHABILITY_DELAY_MS = 2000;
const LIVE_HOOK_TIMEOUT_MS = Math.max(
  LIVE_REACHABILITY_ATTEMPTS * REQUEST_TIMEOUT_MS +
    (LIVE_REACHABILITY_ATTEMPTS - 1) * LIVE_REACHABILITY_DELAY_MS +
    5000,
  10_000
);

class StagingUnavailableError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = 'StagingUnavailableError';
    if (cause !== undefined) {
      (this as any).cause = cause;
    }
  }
}

let reachabilityPromise: Promise<boolean> | null = null;

function ensureServerAvailable() {
  if (!baseUrl) {
    throw new Error('No server defined for contract tests. Set STAGING_DOMAIN or update spec.servers.');
  }
}

function findResponseSchema(pathKey: string, method: HttpMethod, status = '200') {
  const op = spec.paths?.[pathKey]?.[method];
  const content = op?.responses?.[status]?.content?.['application/json']?.schema;
  if (!content) throw new Error(`No schema for ${method.toUpperCase()} ${pathKey} ${status}`);
  return content;
}

function resolveRefs(schema: any): any {
  if (!schema) {
    return schema;
  }
  if (schema.$ref && typeof schema.$ref === 'string') {
    const target = getRef(schema.$ref);
    if (!target) {
      throw new Error(`Unable to resolve reference: ${schema.$ref}`);
    }
    return resolveRefs(target);
  }
  if (Array.isArray(schema)) {
    return schema.map((item) => resolveRefs(item));
  }
  if (typeof schema === 'object') {
    const next: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(schema)) {
      next[key] = resolveRefs(value);
    }
    return next;
  }
  return schema;
}

function getRef(ref: string): any {
  if (!ref.startsWith('#/')) {
    return undefined;
  }
  const parts = ref.slice(2).split('/');
  let current: any = spec;
  for (const part of parts) {
    if (current && typeof current === 'object') {
      current = current[part];
    } else {
      return undefined;
    }
  }
  return current;
}

function getValidator(pathKey: string, method: HttpMethod, status: string) {
  const cacheKey = `${pathKey}:${method}:${status}`;
  if (validatorCache.has(cacheKey)) {
    return validatorCache.get(cacheKey)!;
  }
  const schema = resolveRefs(findResponseSchema(pathKey, method, status));
  const validate = ajv.compile(schema);
  validatorCache.set(cacheKey, validate);
  return validate;
}

async function request({ method, pathKey, auth, query, body }: RequestOptions): Promise<{ response: Response; payload: any }> {
  ensureServerAvailable();
  if (!(await isServerReachable())) {
    throw new StagingUnavailableError(`Staging endpoint ${baseUrl} is unreachable. Skipping contract request.`);
  }
  const url = new URL(pathKey.replace(/^\/+/, ''), `${baseUrl!.replace(/\/?$/, '/')}`);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined) {
        url.searchParams.set(key, String(value));
      }
    }
  }

  const headers: Record<string, string> = {};
  if (auth && jwt) {
    headers.Authorization = `Bearer ${jwt}`;
  }
  if (body) {
    headers['Content-Type'] = 'application/json';
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(url.toString(), {
      method: method.toUpperCase(),
      headers,
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal
    });
  } catch (error: any) {
    clearTimeout(timeout);
    if (error?.name === 'AbortError' || error?.name === 'FetchError') {
      throw new StagingUnavailableError(`Request to ${url.toString()} failed: ${error.message ?? error}`, error);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }

  const contentType = response.headers.get('content-type') ?? '';
  const payload = contentType.includes('application/json') ? await response.json() : await response.text();
  return { response, payload };
}

async function isServerReachable(): Promise<boolean> {
  if (!baseUrl) {
    return false;
  }
  if (!reachabilityPromise) {
    reachabilityPromise = pingHealthEndpointWithRetry();
  }
  return reachabilityPromise;
}

async function pingHealthEndpointWithRetry(): Promise<boolean> {
  for (let attempt = 1; attempt <= LIVE_REACHABILITY_ATTEMPTS; attempt += 1) {
    if (await pingHealthEndpoint()) {
      return true;
    }
    if (attempt < LIVE_REACHABILITY_ATTEMPTS) {
      await new Promise((resolve) => setTimeout(resolve, LIVE_REACHABILITY_DELAY_MS));
    }
  }
  return false;
}

async function pingHealthEndpoint(): Promise<boolean> {
  if (!baseUrl) {
    return false;
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const healthUrl = new URL('health', `${baseUrl.replace(/\/?$/, '/')}`);
    const res = await fetch(healthUrl.toString(), { method: 'GET', signal: controller.signal });
    if (!res.ok) {
      console.warn(`[contract] Health check for ${baseUrl} returned ${res.status}. Contract tests will be skipped.`);
      return false;
    }
    return true;
  } catch (error) {
    console.warn(
      `[contract] Unable to reach staging domain at ${baseUrl}: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

async function runOrSkip<T>(operation: () => Promise<T>): Promise<T | undefined> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof StagingUnavailableError) {
      if (requireLiveContracts) throw error;
      console.warn(`[contract] ${error.message}`);
      return undefined;
    }
    throw error;
  }
}

beforeAll(async () => {
  if (!requireLiveContracts) return;
  ensureServerAvailable();
  if (!jwt) throw new Error('STAGING_SMOKE_TOKEN is required when REQUIRE_LIVE_CONTRACTS=true.');
  if (!(await isServerReachable())) {
    throw new Error(`Required live contract endpoint is unreachable: ${baseUrl}`);
  }
}, LIVE_HOOK_TIMEOUT_MS);

const describeIfServer = baseUrl || requireLiveContracts ? describe : describe.skip;
const describeIfAuth = (baseUrl && jwt) || requireLiveContracts ? describe : describe.skip;

const unauthorizedCases: Array<{ method: HttpMethod; path: string; body?: () => Record<string, unknown> }> = [
  {
    method: 'post',
    path: '/posts',
    body: () => ({ content: 'Contract smoke unauthorized', contentType: 'text', aiLabel: 'human' })
  },
  {
    method: 'post',
    path: '/moderation/flag',
    body: () => ({ targetId: randomUUID(), reason: 'spam' })
  },
  { method: 'get', path: '/auth/userinfo' },
  {
    method: 'post',
    path: '/appeals',
    body: () => ({ caseId: `case_${randomUUID()}`, statement: 'Contract smoke appeal' })
  },
  { method: 'get', path: '/user/export' }
];

describeIfServer('Authorization guards', () => {
  test.each(unauthorizedCases)('%s %s yields 401 when missing auth', async ({ method, path, body }) => {
    const result = await runOrSkip(() => request({ method, pathKey: path, auth: false, body: body?.() }));
    if (!result) {
      return;
    }
    const { response, payload } = result;
    expect(response.status).toBe(401);

    const validate = getValidator(path, method, '401');
    const ok = validate(payload);
    if (!ok) {
      console.error(validate.errors);
    }
    expect(ok).toBe(true);
  });
});

describeIfServer('Public feed contract', () => {
  test('GET /feed is publicly readable and matches the response envelope', async () => {
    const result = await runOrSkip(() =>
      request({ method: 'get', pathKey: '/feed', auth: false, query: { limit: 5 } })
    );
    if (!result) return;
    expect(result.response.status).toBe(200);
    const validate = getValidator('/feed', 'get', '200');
    expect(validate(result.payload)).toBe(true);
  });
});

const successCases: Array<{
  name: string;
  method: HttpMethod;
  path: string;
  status: number;
  query?: Record<string, string | number | undefined>;
  body?: () => Record<string, unknown>;
  snapshot?: (payload: any) => Record<string, unknown>;
}> = [
  {
    name: 'GET /feed happy path',
    method: 'get',
    path: '/feed',
    status: 200,
    query: { limit: 5 },
    snapshot: (payload) => ({
      hasItems: Array.isArray(payload.data?.items) && payload.data.items.length > 0,
      hasNextCursor: Boolean(payload.data?.meta?.nextCursor),
      metaKeyCount: typeof payload.data?.meta === 'object' ? Object.keys(payload.data.meta).length : 0
    })
  },
  {
    name: 'POST /posts creates isolated content',
    method: 'post',
    path: '/posts',
    status: 201,
    body: () => ({
      content: `Contract test post ${Date.now()}`,
      contentType: 'text',
      visibility: 'private',
      aiLabel: 'human'
    })
  }
];

describeIfAuth('Authenticated contract coverage', () => {
  const createdPostIds: string[] = [];

  afterAll(async () => {
    for (const postId of createdPostIds) {
      const result = await runOrSkip(() =>
        request({ method: 'delete', pathKey: `/posts/${postId}`, auth: true })
      );
      if (result) expect([204, 404]).toContain(result.response.status);
    }
  });

  test.each(successCases)('$name matches schema', async ({ method, path, status, query, body, snapshot }) => {
    const result = await runOrSkip(
      () =>
        request({
          method,
          pathKey: path,
          auth: true,
          query,
          body: body?.()
        })
    );
    if (!result) {
      return;
    }
    const { response, payload } = result;
    expect(response.status).toBe(status);

    const validate = getValidator(path, method, String(status));
    const ok = validate(payload);
    if (!ok) {
      console.error(validate.errors);
    }
    expect(ok).toBe(true);

    if (path === '/posts' && typeof (payload as any)?.id === 'string') {
      createdPostIds.push((payload as any).id);
    }

    if (snapshot) {
      expect(snapshot(payload)).toMatchInlineSnapshot(
        {
          hasItems: expect.any(Boolean),
          hasNextCursor: expect.any(Boolean),
          metaKeyCount: expect.any(Number)
        },
        `
{
  "hasItems": Any<Boolean>,
  "hasNextCursor": Any<Boolean>,
  "metaKeyCount": Any<Number>,
}
`
      );
    }
  });

  test('POST /posts rejects missing authorship disclosure with 400', async () => {
    const invalidBody = { content: 'Missing disclosure', contentType: 'text' };
    const result = await runOrSkip(() =>
      request({ method: 'post', pathKey: '/posts', auth: true, body: invalidBody })
    );
    if (!result) {
      return;
    }
    const { response, payload } = result;
    expect(response.status).toBe(400);
    const validate = getValidator('/posts', 'post', '400');
    expect(validate(payload)).toBe(true);
  });

  test('POST /moderation/flag rejects bad reason', async () => {
    const invalidBody = {
      contentId: 'not-a-uuid',
      contentType: 'post',
      reason: 'invalid',
      additionalDetails: 'bad reason'
    };
    const result = await runOrSkip(() =>
      request({ method: 'post', pathKey: '/moderation/flag', auth: true, body: invalidBody })
    );
    if (!result) {
      return;
    }
    const { response, payload } = result;
    expect(response.status).toBe(400);
    const validate = getValidator('/moderation/flag', 'post', '400');
    expect(validate(payload)).toBe(true);
  });

  test('GET /feed enforces pagination invariants', async () => {
    const limit = 10;
    const result = await runOrSkip(() =>
      request({ method: 'get', pathKey: '/feed', auth: true, query: { limit } })
    );
    if (!result) {
      return;
    }
    const { response, payload } = result;
    expect(response.status).toBe(200);
    const validate = getValidator('/feed', 'get', '200');
    expect(validate(payload)).toBe(true);

    expect(Array.isArray(payload.data?.items)).toBe(true);
    expect(payload.data.items.length).toBeLessThanOrEqual(limit);
    expect(payload.data.meta?.count).toBeLessThanOrEqual(limit);
    if (payload.data.meta?.nextCursor) {
      expect(typeof payload.data.meta.nextCursor).toBe('string');
    }
  });

  test('GET /feed rejects invalid limit', async () => {
    const result = await runOrSkip(() =>
      request({ method: 'get', pathKey: '/feed', auth: true, query: { limit: 0 } })
    );
    if (!result) {
      return;
    }
    const { response, payload } = result;
    expect(response.status).toBe(400);
    // fallback to error schema when 400 not defined
    if (spec.paths?.['/feed']?.get?.responses?.['400']) {
      const badValidate = getValidator('/feed', 'get', '400');
      expect(badValidate(payload)).toBe(true);
    } else {
      const unauthValidator = getValidator('/feed', 'get', '401');
      expect(unauthValidator(payload)).toBe(true);
    }
  });

  // ---------------------------------------------------------------------------
  // Auth endpoints
  // ---------------------------------------------------------------------------

  test('GET /auth/userinfo returns UserInfo claims when authenticated', async () => {
    const result = await runOrSkip(() => request({ method: 'get', pathKey: '/auth/userinfo', auth: true }));
    if (!result) return;
    const { response, payload } = result;
    expect(response.status).toBe(200);
    const validate = getValidator('/auth/userinfo', 'get', '200');
    const ok = validate(payload);
    if (!ok) console.error(validate.errors);
    expect(ok).toBe(true);
    // OIDC subject claim must be present
    expect(typeof (payload as any)?.data?.sub).toBe('string');
  });

  // ---------------------------------------------------------------------------
  // Moderation appeals
  // ---------------------------------------------------------------------------

  test('POST /appeals returns documented validation or rate-limit response', async () => {
    const result = await runOrSkip(() =>
      request({ method: 'post', pathKey: '/appeals', auth: true, body: { statement: 'no caseId' } })
    );
    if (!result) return;
    const { response, payload } = result;
    expect([400, 429]).toContain(response.status);
    const validate = getValidator('/appeals', 'post', String(response.status));
    const ok = validate(payload);
    if (!ok) console.error(validate.errors);
    expect(ok).toBe(true);
  });

  test('POST /appeals/{appealId}/vote rejects unauthenticated request', async () => {
    const fakeAppealId = randomUUID();
    const result = await runOrSkip(() =>
      request({
        method: 'post',
        pathKey: `/appeals/${fakeAppealId}/vote`,
        auth: false,
        body: { decision: 'uphold' }
      })
    );
    if (!result) return;
    expect(result.response.status).toBe(401);
  });

  // ---------------------------------------------------------------------------
  // Privacy / DSR
  // ---------------------------------------------------------------------------

  test('GET /user/export returns DSRExportResponse when authenticated', async () => {
    const result = await runOrSkip(() => request({ method: 'get', pathKey: '/user/export', auth: true }));
    if (!result) return;
    const { response, payload } = result;
    // 200 OK or 429 if cooldown active — both are valid
    expect([200, 429]).toContain(response.status);
    if (response.status === 200) {
      const validate = getValidator('/user/export', 'get', '200');
      const ok = validate(payload);
      if (!ok) console.error(validate.errors);
      expect(ok).toBe(true);
    }
  });

  test('DELETE /user/delete requires X-Confirm-Delete header', async () => {
    // Without the required header the endpoint must return 400 (missing header guard)
    const result = await runOrSkip(async () => {
      ensureServerAvailable();
      if (!(await isServerReachable())) {
        throw new StagingUnavailableError(`Staging endpoint ${baseUrl} is unreachable.`);
      }
      const url = new URL('user/delete', `${baseUrl!.replace(/\/?$/, '/')}`);
      const headers: Record<string, string> = {};
      if (jwt) headers.Authorization = `Bearer ${jwt}`;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
      try {
        const res = await fetch(url.toString(), {
          method: 'DELETE',
          headers,
          signal: controller.signal
        });
        const payload = await res.json().catch(() => ({}));
        return { response: res, payload };
      } finally {
        clearTimeout(timeout);
      }
    });
    if (!result) return;
    // Without X-Confirm-Delete: true the API should reject with 400 or 401
    expect([400, 401]).toContain(result.response.status);
  });
});
