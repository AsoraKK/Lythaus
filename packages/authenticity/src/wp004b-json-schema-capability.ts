export const WP004B_JSON_SCHEMA_PROBE_TIMEOUT_MS = 90_000 as const;
export const WP004B_JSON_SCHEMA_CAPABILITY_SCHEMA_VERSION = 'lythaus-wp004b-json-schema-capability-v1' as const;
export const WP004B_JSON_SCHEMA_CAPABILITY_MODEL = '@cf/openai/gpt-oss-20b' as const;
export const WP004B_JSON_SCHEMA_MINIMAL_SCHEMA_VERSION = 'lythaus-wp004b-minimal-json-schema-v1' as const;
export const WP004B_JSON_SCHEMA_MINIMAL_DEFAULT_MAX_TOKENS = 64 as const;
export const WP004B_JSON_SCHEMA_MINIMAL_CONFIRMATION_MAX_TOKENS = 512 as const;

export const WP004B_MINIMAL_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    success: { type: 'boolean', const: true },
  },
  required: ['success'],
} as const;

export const WP004B_JSON_SCHEMA_PROBE_SYSTEM_PROMPT = 'Return the requested structured result.' as const;
export const WP004B_JSON_SCHEMA_PROBE_USER_PROMPT = 'Return success as true.' as const;
export const WP004B_JSON_SCHEMA_EXPECTED_B1_FINGERPRINT = '4ebedc2cc257c5a02bb3ca26afcc23c8b28b3c670ffd833e575c09360b269c8a' as const;

export type Wp004bJsonSchemaProbeEnvelope =
  | 'DIRECT_OBJECT'
  | 'RESPONSE_OBJECT'
  | 'RESPONSE_STRING'
  | 'RESULT_STRING'
  | 'OUTPUT_TEXT_STRING'
  | 'CHAT_COMPLETION'
  | 'UNKNOWN';

export type Wp004bJsonSchemaProbeFailureCode =
  | 'RESPONSE_MISSING'
  | 'RESPONSE_TYPE_UNSUPPORTED'
  | 'RESPONSE_STRING_NOT_JSON'
  | 'CHOICES_MISSING'
  | 'CHOICES_TYPE_UNSUPPORTED'
  | 'CHOICES_EMPTY'
  | 'CHOICE_COUNT_INVALID'
  | 'CHOICE_INVALID'
  | 'MESSAGE_MISSING'
  | 'MESSAGE_INVALID'
  | 'MESSAGE_CONTENT_MISSING'
  | 'MESSAGE_CONTENT_TYPE_UNSUPPORTED'
  | 'MESSAGE_CONTENT_NOT_JSON'
  | 'FINISH_REASON_TRUNCATED'
  | 'FINISH_REASON_UNSUPPORTED'
  | 'UNEXPECTED_TOOL_CALL'
  | 'MINIMAL_SCHEMA_INVALID';

export interface Wp004bJsonSchemaProbeDiagnostics {
  providerResultType: 'OBJECT' | 'STRING' | 'ARRAY' | 'NULL' | 'OTHER';
  providerEnvelope: Wp004bJsonSchemaProbeEnvelope;
  providerTopLevelKeys: readonly string[];
  responsePresent: boolean;
  responseType: string | null;
  responseTopLevelKeys: readonly string[];
  resultPresent: boolean;
  resultType: string | null;
  outputTextPresent: boolean;
  outputTextType: string | null;
  choicesPresent: boolean;
  choiceCount: number | null;
  firstChoiceType: string | null;
  firstChoiceKeys: readonly string[];
  messagePresent: boolean;
  messageType: string | null;
  messageKeys: readonly string[];
  messageRolePresent: boolean;
  messageRoleType: string | null;
  messageContentPresent: boolean;
  messageContentType: string | null;
  messageContentLength: number | null;
  messageContentJsonParseable: boolean | null;
  finishReasonPresent: boolean;
  finishReasonType: string | null;
  finishReasonValueCode: 'STOP' | 'LENGTH' | 'TOOL_CALLS' | 'OTHER' | null;
  toolCallsPresent: boolean;
  toolCallCount: number | null;
  messageReasoningFieldPresent: boolean;
  messageReasoningFieldType: string | null;
  topLevelReasoningFieldPresent: boolean;
  topLevelReasoningFieldType: string | null;
  stringJsonParseable: boolean | null;
  normalizationFailureCode: Wp004bJsonSchemaProbeFailureCode | null;
}

export interface Wp004bJsonSchemaProbeResult {
  readonly success: true;
}

export interface Wp004bJsonSchemaProbeRequest {
  readonly messages: readonly { role: 'system' | 'user'; content: string }[];
  readonly response_format: {
    readonly type: 'json_schema';
    readonly json_schema: typeof WP004B_MINIMAL_JSON_SCHEMA;
  };
  readonly temperature: 0;
  readonly max_tokens: 64 | 512;
  readonly stream: false;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function typeOf(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

function safeKeys(value: unknown): readonly string[] {
  return isRecord(value) ? Object.keys(value).sort() : [];
}

function hasOwn(value: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function providerResultType(value: unknown): Wp004bJsonSchemaProbeDiagnostics['providerResultType'] {
  if (isRecord(value)) return 'OBJECT';
  if (typeof value === 'string') return 'STRING';
  if (Array.isArray(value)) return 'ARRAY';
  if (value === null) return 'NULL';
  return 'OTHER';
}

function finishReasonCode(value: unknown): Wp004bJsonSchemaProbeDiagnostics['finishReasonValueCode'] {
  if (typeof value !== 'string') return null;
  if (value === 'stop') return 'STOP';
  if (value === 'length') return 'LENGTH';
  if (value === 'tool_calls') return 'TOOL_CALLS';
  return 'OTHER';
}

function createDiagnostics(value: unknown): Wp004bJsonSchemaProbeDiagnostics {
  const diagnostics: Wp004bJsonSchemaProbeDiagnostics = {
    providerResultType: providerResultType(value),
    providerEnvelope: 'UNKNOWN',
    providerTopLevelKeys: safeKeys(value),
    responsePresent: isRecord(value) && hasOwn(value, 'response'),
    responseType: isRecord(value) && hasOwn(value, 'response') ? typeOf(value.response) : null,
    responseTopLevelKeys: isRecord(value) && hasOwn(value, 'response') ? safeKeys(value.response) : [],
    resultPresent: isRecord(value) && hasOwn(value, 'result'),
    resultType: isRecord(value) && hasOwn(value, 'result') ? typeOf(value.result) : null,
    outputTextPresent: isRecord(value) && hasOwn(value, 'output_text'),
    outputTextType: isRecord(value) && hasOwn(value, 'output_text') ? typeOf(value.output_text) : null,
    choicesPresent: isRecord(value) && hasOwn(value, 'choices'),
    choiceCount: isRecord(value) && Array.isArray(value.choices) ? value.choices.length : null,
    firstChoiceType: null,
    firstChoiceKeys: [],
    messagePresent: false,
    messageType: null,
    messageKeys: [],
    messageRolePresent: false,
    messageRoleType: null,
    messageContentPresent: false,
    messageContentType: null,
    messageContentLength: null,
    messageContentJsonParseable: null,
    finishReasonPresent: false,
    finishReasonType: null,
    finishReasonValueCode: null,
    toolCallsPresent: false,
    toolCallCount: null,
    messageReasoningFieldPresent: false,
    messageReasoningFieldType: null,
    topLevelReasoningFieldPresent: isRecord(value) && hasOwn(value, 'reasoning'),
    topLevelReasoningFieldType: isRecord(value) && hasOwn(value, 'reasoning') ? typeOf(value.reasoning) : null,
    stringJsonParseable: null,
    normalizationFailureCode: null,
  };
  if (isRecord(value) && Array.isArray(value.choices) && value.choices.length > 0) {
    diagnostics.firstChoiceType = typeOf(value.choices[0]);
    diagnostics.firstChoiceKeys = safeKeys(value.choices[0]);
  }
  return diagnostics;
}

export class Wp004bJsonSchemaProbeNormalizationError extends Error {
  readonly code: Wp004bJsonSchemaProbeFailureCode;
  readonly diagnostics: Wp004bJsonSchemaProbeDiagnostics;

  constructor(code: Wp004bJsonSchemaProbeFailureCode, diagnostics: Wp004bJsonSchemaProbeDiagnostics) {
    super(`wp004b_json_schema_probe_${code.toLowerCase()}`);
    this.name = 'Wp004bJsonSchemaProbeNormalizationError';
    this.code = code;
    this.diagnostics = diagnostics;
  }
}

function parseJsonSurface(text: string, diagnostics: Wp004bJsonSchemaProbeDiagnostics, surface: 'string' | 'message'): unknown {
  const normalized = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
  try {
    const parsed = JSON.parse(normalized);
    if (surface === 'message') {
      diagnostics.messageContentJsonParseable = true;
    } else {
      diagnostics.stringJsonParseable = true;
    }
    return parsed;
  } catch {
    if (surface === 'message') diagnostics.messageContentJsonParseable = false;
    else diagnostics.stringJsonParseable = false;
    throw new Wp004bJsonSchemaProbeNormalizationError(surface === 'message' ? 'MESSAGE_CONTENT_NOT_JSON' : 'RESPONSE_STRING_NOT_JSON', diagnostics);
  }
}

function unwrapChatCompletion(value: Record<string, unknown>, diagnostics: Wp004bJsonSchemaProbeDiagnostics): unknown {
  diagnostics.providerEnvelope = 'CHAT_COMPLETION';
  if (!hasOwn(value, 'choices')) throw new Wp004bJsonSchemaProbeNormalizationError('CHOICES_MISSING', diagnostics);
  if (!Array.isArray(value.choices)) throw new Wp004bJsonSchemaProbeNormalizationError('CHOICES_TYPE_UNSUPPORTED', diagnostics);
  if (value.choices.length === 0) throw new Wp004bJsonSchemaProbeNormalizationError('CHOICES_EMPTY', diagnostics);
  if (value.choices.length !== 1) throw new Wp004bJsonSchemaProbeNormalizationError('CHOICE_COUNT_INVALID', diagnostics);
  const choice = value.choices[0];
  if (!isRecord(choice)) throw new Wp004bJsonSchemaProbeNormalizationError('CHOICE_INVALID', diagnostics);
  if (hasOwn(choice, 'index') && choice.index !== 0) throw new Wp004bJsonSchemaProbeNormalizationError('CHOICE_INVALID', diagnostics);
  if (!hasOwn(choice, 'finish_reason')) throw new Wp004bJsonSchemaProbeNormalizationError('FINISH_REASON_UNSUPPORTED', diagnostics);
  diagnostics.finishReasonPresent = true;
  diagnostics.finishReasonType = typeOf(choice.finish_reason);
  diagnostics.finishReasonValueCode = finishReasonCode(choice.finish_reason);
  if (choice.finish_reason === 'length') throw new Wp004bJsonSchemaProbeNormalizationError('FINISH_REASON_TRUNCATED', diagnostics);
  if (choice.finish_reason !== 'stop') throw new Wp004bJsonSchemaProbeNormalizationError('FINISH_REASON_UNSUPPORTED', diagnostics);
  if (!hasOwn(choice, 'message')) throw new Wp004bJsonSchemaProbeNormalizationError('MESSAGE_MISSING', diagnostics);
  diagnostics.messagePresent = true;
  diagnostics.messageType = typeOf(choice.message);
  diagnostics.messageKeys = safeKeys(choice.message);
  if (!isRecord(choice.message)) throw new Wp004bJsonSchemaProbeNormalizationError('MESSAGE_INVALID', diagnostics);
  const message = choice.message;
  if (hasOwn(message, 'role')) {
    diagnostics.messageRolePresent = true;
    diagnostics.messageRoleType = typeOf(message.role);
    if (message.role !== 'assistant') throw new Wp004bJsonSchemaProbeNormalizationError('MESSAGE_INVALID', diagnostics);
  }
  if (hasOwn(message, 'reasoning')) {
    diagnostics.messageReasoningFieldPresent = true;
    diagnostics.messageReasoningFieldType = typeOf(message.reasoning);
  }
  if (hasOwn(message, 'tool_calls')) {
    diagnostics.toolCallsPresent = true;
    diagnostics.toolCallCount = Array.isArray(message.tool_calls) ? message.tool_calls.length : null;
    if (!Array.isArray(message.tool_calls) || message.tool_calls.length > 0) throw new Wp004bJsonSchemaProbeNormalizationError('UNEXPECTED_TOOL_CALL', diagnostics);
  }
  if (!hasOwn(message, 'content')) throw new Wp004bJsonSchemaProbeNormalizationError('MESSAGE_CONTENT_MISSING', diagnostics);
  diagnostics.messageContentPresent = true;
  diagnostics.messageContentType = typeOf(message.content);
  if (typeof message.content !== 'string') throw new Wp004bJsonSchemaProbeNormalizationError('MESSAGE_CONTENT_TYPE_UNSUPPORTED', diagnostics);
  diagnostics.messageContentLength = message.content.length;
  if (!message.content.trim()) throw new Wp004bJsonSchemaProbeNormalizationError('MESSAGE_CONTENT_MISSING', diagnostics);
  return parseJsonSurface(message.content, diagnostics, 'message');
}

function unwrapProviderResult(value: unknown, diagnostics: Wp004bJsonSchemaProbeDiagnostics): unknown {
  if (typeof value === 'string') {
    diagnostics.providerEnvelope = 'RESPONSE_STRING';
    return parseJsonSurface(value, diagnostics, 'string');
  }
  if (!isRecord(value)) throw new Wp004bJsonSchemaProbeNormalizationError('RESPONSE_TYPE_UNSUPPORTED', diagnostics);
  if (hasOwn(value, 'success')) {
    diagnostics.providerEnvelope = 'DIRECT_OBJECT';
    return value;
  }
  if (hasOwn(value, 'response')) {
    if (typeof value.response === 'string') {
      diagnostics.providerEnvelope = 'RESPONSE_STRING';
      return parseJsonSurface(value.response, diagnostics, 'string');
    }
    if (isRecord(value.response)) {
      diagnostics.providerEnvelope = 'RESPONSE_OBJECT';
      diagnostics.responseTopLevelKeys = safeKeys(value.response);
      return value.response;
    }
    throw new Wp004bJsonSchemaProbeNormalizationError('RESPONSE_TYPE_UNSUPPORTED', diagnostics);
  }
  for (const key of ['result', 'output_text'] as const) {
    if (!hasOwn(value, key)) continue;
    if (typeof value[key] !== 'string') throw new Wp004bJsonSchemaProbeNormalizationError('RESPONSE_TYPE_UNSUPPORTED', diagnostics);
    diagnostics.providerEnvelope = key === 'result' ? 'RESULT_STRING' : 'OUTPUT_TEXT_STRING';
    return parseJsonSurface(value[key], diagnostics, 'string');
  }
  if (value.object === 'chat.completion' || hasOwn(value, 'choices')) return unwrapChatCompletion(value, diagnostics);
  throw new Wp004bJsonSchemaProbeNormalizationError('RESPONSE_MISSING', diagnostics);
}

function assertMinimalSchema(value: unknown, diagnostics: Wp004bJsonSchemaProbeDiagnostics): Wp004bJsonSchemaProbeResult {
  if (!isRecord(value) || Object.keys(value).length !== 1 || value.success !== true) {
    throw new Wp004bJsonSchemaProbeNormalizationError('MINIMAL_SCHEMA_INVALID', diagnostics);
  }
  return { success: true };
}

export function normalizeWp004bJsonSchemaProbeResult(value: unknown): { result: Wp004bJsonSchemaProbeResult; diagnostics: Wp004bJsonSchemaProbeDiagnostics } {
  const diagnostics = createDiagnostics(value);
  try {
    const candidate = unwrapProviderResult(value, diagnostics);
    const result = assertMinimalSchema(candidate, diagnostics);
    diagnostics.normalizationFailureCode = null;
    return { result, diagnostics };
  } catch (error) {
    if (error instanceof Wp004bJsonSchemaProbeNormalizationError) {
      error.diagnostics.normalizationFailureCode = error.code;
      throw error;
    }
    diagnostics.normalizationFailureCode = 'MINIMAL_SCHEMA_INVALID';
    throw new Wp004bJsonSchemaProbeNormalizationError('MINIMAL_SCHEMA_INVALID', diagnostics);
  }
}

export function buildWp004bJsonSchemaCapabilityRequest(options: { maxTokens?: 64 | 512 } = {}): Wp004bJsonSchemaProbeRequest {
  return {
    messages: [
      { role: 'system', content: WP004B_JSON_SCHEMA_PROBE_SYSTEM_PROMPT },
      { role: 'user', content: WP004B_JSON_SCHEMA_PROBE_USER_PROMPT },
    ],
    response_format: { type: 'json_schema', json_schema: WP004B_MINIMAL_JSON_SCHEMA },
    temperature: 0,
    max_tokens: options.maxTokens ?? WP004B_JSON_SCHEMA_MINIMAL_DEFAULT_MAX_TOKENS,
    stream: false,
  };
}

export function shouldExecuteWp004bFullProbe(minimalProbeSucceeded: boolean): boolean {
  return minimalProbeSucceeded === true;
}

export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map((item) => canonicalJson(item)).join(',')}]`;
  if (isRecord(value)) return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  const serialized = JSON.stringify(value);
  if (serialized === undefined) throw new Error('WP004B_JSON_SCHEMA_CANONICALIZATION_INVALID');
  return serialized;
}
