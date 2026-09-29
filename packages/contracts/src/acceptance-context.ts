export function acceptanceContextToken(value: string): string {
  let token: unknown = value;
  if (value.startsWith('{')) {
    try { token = (JSON.parse(value) as { context?: unknown }).context; }
    catch { throw new Error('acceptance_context_invalid'); }
  }
  if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) throw new Error('acceptance_context_invalid');
  return token;
}

export function requireAcceptanceRejection(
  response: { status: number; body: Record<string, unknown> | null },
  status: number,
  codes: readonly string[],
): void {
  if (response.status !== status || typeof response.body?.error !== 'string' || !codes.includes(response.body.error)) {
    throw new Error('candidate_rejection_not_proven');
  }
}
