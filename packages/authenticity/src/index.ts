export type AuthenticityContentKind = 'text' | 'image' | 'profile';

export interface AuthenticitySignal {
  category: string;
  confidence: number;
  rationale: string;
}

export interface AuthenticityEvaluation {
  schemaVersion: 'lythaus-authenticity-v1';
  recommendation: 'review';
  reviewRequired: true;
  riskScore: number;
  signals: AuthenticitySignal[];
  modelId: string;
  policyVersion: 'evaluation-only-v1';
}

export type AuthenticityModelRunner = (model: string, input: unknown, idempotencyKey: string) => Promise<unknown>;

const DEFAULT_MODEL = '@cf/meta/llama-3.1-8b-instruct-fast';

function modelText(value: unknown): string {
  if (typeof value === 'string') return value;
  if (!value || typeof value !== 'object') return '{}';
  const candidate = value as { response?: unknown; result?: unknown };
  if (typeof candidate.response === 'string') return candidate.response;
  if (typeof candidate.result === 'string') return candidate.result;
  return JSON.stringify(value);
}

function normalizeSignals(value: unknown): AuthenticitySignal[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 20).flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const signal = item as { category?: unknown; confidence?: unknown; rationale?: unknown };
    if (typeof signal.category !== 'string') return [];
    const confidence = Math.max(0, Math.min(1, Number(signal.confidence ?? 0)));
    return [{
      category: signal.category.slice(0, 80),
      confidence: Number.isFinite(confidence) ? confidence : 0,
      rationale: typeof signal.rationale === 'string' ? signal.rationale.slice(0, 500) : '',
    }];
  });
}

export async function evaluateAuthenticity(input: {
  kind: AuthenticityContentKind;
  content: string;
  contentId: string;
  declaredCreationMode?: string;
  modelId?: string;
  runModel: AuthenticityModelRunner;
}): Promise<AuthenticityEvaluation> {
  const modelId = input.modelId ?? DEFAULT_MODEL;
  const raw = await input.runModel(modelId, {
    messages: [
      {
        role: 'system',
        content: 'You are Lythaus Authenticity AI. Return JSON only with riskScore from 0 to 1 and signals containing category, confidence, and concise rationale. This is evaluation evidence for a human reviewer, never an automatic allow or block decision.',
      },
      {
        role: 'user',
        content: JSON.stringify({
          kind: input.kind,
          content: input.content,
          declaredCreationMode: input.declaredCreationMode ?? null,
        }),
      },
    ],
    response_format: { type: 'json_object' },
    max_tokens: 700,
    temperature: 0,
  }, `authenticity:${input.kind}:${input.contentId}`);
  let parsed: { riskScore?: unknown; signals?: unknown } = {};
  try {
    parsed = JSON.parse(modelText(raw)) as typeof parsed;
  } catch {
    parsed = { riskScore: 1, signals: [{ category: 'model_response_invalid', confidence: 1, rationale: 'The evaluation response could not be parsed.' }] };
  }
  const riskScore = Math.max(0, Math.min(1, Number(parsed.riskScore ?? 1)));
  return {
    schemaVersion: 'lythaus-authenticity-v1',
    recommendation: 'review',
    reviewRequired: true,
    riskScore: Number.isFinite(riskScore) ? riskScore : 1,
    signals: normalizeSignals(parsed.signals),
    modelId,
    policyVersion: 'evaluation-only-v1',
  };
}
