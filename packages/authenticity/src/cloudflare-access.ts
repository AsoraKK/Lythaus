import {
  CLOUDFLARE_AI_REST_BASE_URL,
  cloudflareRestErrorCategoryForStatus,
  cloudflareSafeProviderDiagnosticsFromBody,
  CloudflareRestError,
  type CloudflareRestErrorCategory,
} from './cloudflare-rest.ts';
import { CLOUDFLARE_VISION_OBSERVER_MODEL } from './research-config.ts';

export const CLOUDFLARE_MODEL_SCHEMA_PREFLIGHT_SCHEMA_VERSION = 'lythaus-cloudflare-model-schema-preflight-v1' as const;

export const CLOUDFLARE_MODEL_RESPONSE_FORMAT_SUPPORT = [
  'MOONDREAM_RESPONSE_FORMAT_SUPPORTED',
  'MOONDREAM_RESPONSE_FORMAT_NOT_DECLARED',
  'MOONDREAM_RESPONSE_FORMAT_UNCLEAR',
] as const;
export type CloudflareModelResponseFormatSupport = (typeof CLOUDFLARE_MODEL_RESPONSE_FORMAT_SUPPORT)[number];

export const CLOUDFLARE_MODEL_RESPONSE_EXPECTATIONS = [
  'GPT_OSS_RESPONSE_OBJECT_EXPECTED',
  'GPT_OSS_RESPONSE_STRING_EXPECTED',
  'GPT_OSS_RESPONSE_SHAPE_AMBIGUOUS',
] as const;
export type CloudflareModelResponseExpectation = (typeof CLOUDFLARE_MODEL_RESPONSE_EXPECTATIONS)[number];

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
  inputSchemaPropertyNames: readonly string[];
  outputSchemaPropertyNames: readonly string[];
  responseFormatSupport: CloudflareModelResponseFormatSupport;
  responseFormatDeclared: boolean | null;
  outputResponseType: string | null;
  responseExpectation: CloudflareModelResponseExpectation | null;
  executionMs: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function schemaPropertyNames(value: unknown): readonly string[] {
  if (!isRecord(value) || !isRecord(value.properties)) return [];
  return Object.keys(value.properties)
    .filter((key) => /^[A-Za-z][A-Za-z0-9_.-]{0,79}$/.test(key))
    .sort()
    .slice(0, 64);
}

function schemaPropertyType(value: unknown, propertyName: string): string | null {
  if (!isRecord(value) || !isRecord(value.properties) || !isRecord(value.properties[propertyName])) return null;
  const type = value.properties[propertyName].type;
  return typeof type === 'string' && /^[A-Za-z][A-Za-z0-9_.-]{0,31}$/.test(type) ? type.toUpperCase() : null;
}

function responseFormatDeclared(value: unknown): boolean | null {
  if (!isRecord(value) || !isRecord(value.properties)) return null;
  return Object.prototype.hasOwnProperty.call(value.properties, 'response_format');
}

function responseFormatSupport(value: unknown): CloudflareModelResponseFormatSupport {
  if (!isRecord(value) || !isRecord(value.properties)) return 'MOONDREAM_RESPONSE_FORMAT_UNCLEAR';
  return Object.prototype.hasOwnProperty.call(value.properties, 'response_format')
    ? 'MOONDREAM_RESPONSE_FORMAT_SUPPORTED'
    : 'MOONDREAM_RESPONSE_FORMAT_NOT_DECLARED';
}

function responseExpectation(model: string, output: unknown): CloudflareModelResponseExpectation | null {
  if (!model.toLowerCase().startsWith('@cf/openai/gpt-oss')) return null;
  const responseType = schemaPropertyType(output, 'response');
  if (responseType === 'OBJECT') return 'GPT_OSS_RESPONSE_OBJECT_EXPECTED';
  if (responseType === 'STRING') return 'GPT_OSS_RESPONSE_STRING_EXPECTED';
  return 'GPT_OSS_RESPONSE_SHAPE_AMBIGUOUS';
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
    inputSchemaPropertyNames: [],
    outputSchemaPropertyNames: [],
    responseFormatSupport: 'MOONDREAM_RESPONSE_FORMAT_UNCLEAR',
    responseFormatDeclared: null,
    outputResponseType: null,
    responseExpectation: null,
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
    const inputSchema = body.result.input;
    const outputSchema = body.result.output;
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
      inputSchemaPropertyNames: schemaPropertyNames(inputSchema),
      outputSchemaPropertyNames: schemaPropertyNames(outputSchema),
      responseFormatSupport: responseFormatSupport(inputSchema),
      responseFormatDeclared: responseFormatDeclared(inputSchema),
      outputResponseType: schemaPropertyType(outputSchema, 'response'),
      responseExpectation: responseExpectation(model, outputSchema),
      executionMs: Date.now() - startedAt,
    };
  } catch (error) {
    if (error instanceof CloudflareRestError) return failure(model, startedAt, error);
    return failure(model, startedAt, new CloudflareRestError(timedOut ? 'TIMEOUT' : 'NETWORK_FAILURE'));
  } finally {
    if (timeoutHandle) clearTimeout(timeoutHandle);
  }
}
