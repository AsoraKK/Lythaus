export const CLOUDFLARE_AI_REST_BASE_URL = 'https://api.cloudflare.com/client/v4' as const;

export type CloudflareRestErrorCategory =
  | 'MISSING_CREDENTIAL'
  | 'NETWORK_DISABLED'
  | 'HTTP_AUTHENTICATION_FAILURE'
  | 'HTTP_RATE_LIMITED'
  | 'HTTP_SERVER_FAILURE'
  | 'HTTP_FAILURE'
  | 'PROVIDER_FAILURE'
  | 'MALFORMED_RESPONSE'
  | 'TIMEOUT'
  | 'NETWORK_FAILURE'
  | 'INVOCATION_CAP_EXCEEDED';

export type CloudflareRestCallKind = 'VISION_OBSERVER' | 'JUDGE';

export interface CloudflareRestCredentials {
  apiToken: string;
  accountId: string;
}

export interface CloudflareRestInvocation {
  kind: CloudflareRestCallKind;
  model: string;
  status: 'SUCCESS' | 'PROVIDER_FAILURE';
  httpStatus: number | null;
  executionMs: number;
}

export interface CloudflareRestSnapshot {
  calls: number;
  successes: number;
  providerFailures: number;
  invocations: readonly CloudflareRestInvocation[];
}

export interface CloudflareRestRunResult {
  result: unknown;
  httpStatus: number;
  executionMs: number;
}

export interface CloudflareRestTransport {
  readonly isLive: true;
  run(input: {
    kind: CloudflareRestCallKind;
    model: string;
    payload: unknown;
  }): Promise<CloudflareRestRunResult>;
  snapshot(): CloudflareRestSnapshot;
}

export interface CloudflareRestTransportOptions {
  credentials?: Partial<CloudflareRestCredentials>;
  apiToken?: string;
  accountId?: string;
  allowNetwork?: boolean;
  maxRequests: number;
  timeoutMs?: number;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}

export class CloudflareRestError extends Error {
  readonly category: CloudflareRestErrorCategory;
  readonly httpStatus: number | null;

  constructor(category: CloudflareRestErrorCategory, httpStatus: number | null = null) {
    super(`cloudflare_rest_${category.toLowerCase()}`);
    this.name = 'CloudflareRestError';
    this.category = category;
    this.httpStatus = httpStatus;
  }
}

function encodeModelPath(model: string): string {
  if (!model.trim() || model.includes('..') || model.includes('\\')) throw new CloudflareRestError('HTTP_FAILURE');
  return model.split('/').map((segment) => encodeURIComponent(segment)).join('/');
}

function credentialsFromOptions(options: CloudflareRestTransportOptions): CloudflareRestCredentials | null {
  const apiToken = options.apiToken ?? options.credentials?.apiToken;
  const accountId = options.accountId ?? options.credentials?.accountId;
  if (!apiToken?.trim() || !accountId?.trim()) return null;
  return { apiToken: apiToken.trim(), accountId: accountId.trim() };
}

function errorCategoryForStatus(status: number): CloudflareRestErrorCategory {
  if (status === 401 || status === 403) return 'HTTP_AUTHENTICATION_FAILURE';
  if (status === 429) return 'HTTP_RATE_LIMITED';
  if (status >= 500) return 'HTTP_SERVER_FAILURE';
  return 'HTTP_FAILURE';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function createCloudflareRestTransport(options: CloudflareRestTransportOptions): CloudflareRestTransport {
  const credentials = credentialsFromOptions(options);
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const timeoutMs = options.timeoutMs ?? 30_000;
  const baseUrl = (options.baseUrl ?? CLOUDFLARE_AI_REST_BASE_URL).replace(/\/$/, '');
  const maxRequests = options.maxRequests;
  const invocations: CloudflareRestInvocation[] = [];
  let calls = 0;

  if (!Number.isInteger(maxRequests) || maxRequests <= 0) throw new CloudflareRestError('INVOCATION_CAP_EXCEEDED');
  if (!Number.isInteger(timeoutMs) || timeoutMs <= 0) throw new CloudflareRestError('TIMEOUT');

  function complete(invocation: CloudflareRestInvocation): void {
    invocations.push(invocation);
  }

  return {
    isLive: true,
    async run(input): Promise<CloudflareRestRunResult> {
      const startedAt = Date.now();
      const model = input.model;
      const kind = input.kind;
      let recorded = false;
      const recordFailure = (httpStatus: number | null): void => {
        if (recorded) return;
        recorded = true;
        complete({ kind, model, status: 'PROVIDER_FAILURE', httpStatus, executionMs: Date.now() - startedAt });
      };
      if (calls >= maxRequests) {
        throw new CloudflareRestError('INVOCATION_CAP_EXCEEDED');
      }
      calls += 1;
      if (!options.allowNetwork) {
        const error = new CloudflareRestError('NETWORK_DISABLED');
        recordFailure(null);
        throw error;
      }
      if (!credentials) {
        const error = new CloudflareRestError('MISSING_CREDENTIAL');
        recordFailure(null);
        throw error;
      }
      const url = `${baseUrl}/accounts/${encodeURIComponent(credentials.accountId)}/ai/run/${encodeModelPath(model)}`;
      const controller = new AbortController();
      let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
      let timedOut = false;
      try {
        const request = fetchImpl(url, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${credentials.apiToken}`,
            'content-type': 'application/json',
          },
          body: JSON.stringify(input.payload),
          signal: controller.signal,
        });
        void request.catch(() => undefined);
        const timeout = new Promise<never>((_, reject) => {
          timeoutHandle = setTimeout(() => {
            timedOut = true;
            controller.abort();
            reject(new CloudflareRestError('TIMEOUT'));
          }, timeoutMs);
        });
        const response = await Promise.race([request, timeout]);
        if (!response.ok) {
          const error = new CloudflareRestError(errorCategoryForStatus(response.status), response.status);
          recordFailure(response.status);
          throw error;
        }
        let body: unknown;
        try {
          body = await response.json();
        } catch {
          const error = new CloudflareRestError('MALFORMED_RESPONSE', response.status);
          recordFailure(response.status);
          throw error;
        }
        if (!isRecord(body) || body.success !== true || !Object.prototype.hasOwnProperty.call(body, 'result')) {
          const error = new CloudflareRestError(body && isRecord(body) && body.success === false ? 'PROVIDER_FAILURE' : 'MALFORMED_RESPONSE', response.status);
          recordFailure(response.status);
          throw error;
        }
        const executionMs = Date.now() - startedAt;
        recorded = true;
        complete({ kind, model, status: 'SUCCESS', httpStatus: response.status, executionMs });
        return { result: body.result, httpStatus: response.status, executionMs };
      } catch (error) {
        if (error instanceof CloudflareRestError) {
          recordFailure(error.httpStatus);
          throw error;
        }
        const category = timedOut ? 'TIMEOUT' : 'NETWORK_FAILURE';
        const normalized = new CloudflareRestError(category);
        recordFailure(null);
        throw normalized;
      } finally {
        if (timeoutHandle) clearTimeout(timeoutHandle);
      }
    },
    snapshot(): CloudflareRestSnapshot {
      return {
        calls,
        successes: invocations.filter((invocation) => invocation.status === 'SUCCESS').length,
        providerFailures: invocations.filter((invocation) => invocation.status === 'PROVIDER_FAILURE').length,
        invocations: [...invocations],
      };
    },
  };
}

export function cloudflareRestCredentialsFromEnvironment(environment: Record<string, string | undefined> = {}): Partial<CloudflareRestCredentials> {
  return {
    apiToken: environment.CLOUDFLARE_API_TOKEN?.trim() || undefined,
    accountId: environment.CLOUDFLARE_ACCOUNT_ID?.trim() || undefined,
  };
}
