import {
  CLOUDFLARE_AI_REST_BASE_URL,
  cloudflareRestErrorCategoryForStatus,
  cloudflareSafeProviderDiagnosticsFromBody,
  CloudflareRestError,
  type CloudflareRestErrorCategory,
} from './cloudflare-rest.ts';
import { CLOUDFLARE_VISION_OBSERVER_MODEL } from './research-config.ts';

export const CLOUDFLARE_MODEL_SCHEMA_PREFLIGHT_SCHEMA_VERSION = 'lythaus-cloudflare-model-schema-preflight-v1' as const;

export interface CloudflareModelSchemaPreflightOptions {
  apiToken?: string;
  accountId?: string;
  model?: string;
  allowNetwork?: boolean;
  timeoutMs?: number;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}

export interface CloudflareModelSchemaPreflightResult {
  schemaVersion: typeof CLOUDFLARE_MODEL_SCHEMA_PREFLIGHT_SCHEMA_VERSION;
  provider: 'cloudflare-workers-ai-rest';
  model: string;
  status: 'SUCCESS' | 'PROVIDER_FAILURE';
  schemaAvailable: boolean;
  httpStatus: number | null;
  transportErrorCategory: CloudflareRestErrorCategory | null;
  providerErrorCode: number | string | null;
  providerErrorMessageCode: string | null;
  executionMs: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function failure(model: string, startedAt: number, error: CloudflareRestError): CloudflareModelSchemaPreflightResult {
  return {
    schemaVersion: CLOUDFLARE_MODEL_SCHEMA_PREFLIGHT_SCHEMA_VERSION,
    provider: 'cloudflare-workers-ai-rest',
    model,
    status: 'PROVIDER_FAILURE',
    schemaAvailable: false,
    httpStatus: error.httpStatus,
    transportErrorCategory: error.category,
    providerErrorCode: error.providerErrorCode,
    providerErrorMessageCode: error.providerErrorMessageCode,
    executionMs: Date.now() - startedAt,
  };
}

export async function runCloudflareModelSchemaPreflight(options: CloudflareModelSchemaPreflightOptions = {}): Promise<CloudflareModelSchemaPreflightResult> {
  const startedAt = Date.now();
  const model = options.model ?? CLOUDFLARE_VISION_OBSERVER_MODEL;
  const timeoutMs = options.timeoutMs ?? 30_000;
  const baseUrl = (options.baseUrl ?? CLOUDFLARE_AI_REST_BASE_URL).replace(/\/$/, '');
  const apiToken = options.apiToken?.trim() ?? '';
  const accountId = options.accountId?.trim() ?? '';
  if (!options.allowNetwork) return failure(model, startedAt, new CloudflareRestError('NETWORK_DISABLED'));
  if (!apiToken || !accountId) return failure(model, startedAt, new CloudflareRestError('MISSING_CREDENTIAL'));
  if (!Number.isInteger(timeoutMs) || timeoutMs <= 0) return failure(model, startedAt, new CloudflareRestError('TIMEOUT'));

  const url = `${baseUrl}/accounts/${encodeURIComponent(accountId)}/ai/models/schema?model=${encodeURIComponent(model)}`;
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const controller = new AbortController();
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
  let timedOut = false;
  try {
    const request = fetchImpl(url, {
      method: 'GET',
      headers: { Authorization: `Bearer ${apiToken}`, accept: 'application/json' },
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
    let body: unknown = null;
    if (!response.ok) {
      try {
        body = await response.json();
      } catch {
        body = null;
      }
      throw new CloudflareRestError(cloudflareRestErrorCategoryForStatus(response.status), response.status, cloudflareSafeProviderDiagnosticsFromBody(body));
    }
    try {
      body = await response.json();
    } catch {
      throw new CloudflareRestError('MALFORMED_RESPONSE', response.status);
    }
    if (!isRecord(body) || body.success !== true || !isRecord(body.result) || !isRecord(body.result.input) || !isRecord(body.result.output)) {
      throw new CloudflareRestError(body && isRecord(body) && body.success === false ? 'PROVIDER_FAILURE' : 'MALFORMED_RESPONSE', response.status, cloudflareSafeProviderDiagnosticsFromBody(body));
    }
    return {
      schemaVersion: CLOUDFLARE_MODEL_SCHEMA_PREFLIGHT_SCHEMA_VERSION,
      provider: 'cloudflare-workers-ai-rest',
      model,
      status: 'SUCCESS',
      schemaAvailable: true,
      httpStatus: response.status,
      transportErrorCategory: null,
      providerErrorCode: null,
      providerErrorMessageCode: null,
      executionMs: Date.now() - startedAt,
    };
  } catch (error) {
    if (error instanceof CloudflareRestError) return failure(model, startedAt, error);
    return failure(model, startedAt, new CloudflareRestError(timedOut ? 'TIMEOUT' : 'NETWORK_FAILURE'));
  } finally {
    if (timeoutHandle) clearTimeout(timeoutHandle);
  }
}
