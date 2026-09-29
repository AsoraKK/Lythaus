import { requirePasswordInput } from '../../../../packages/contracts/src/password-policy.ts';

let pendingIntake: { fingerprint: string; key: string } | undefined;
globalThis.addEventListener?.('pagehide', () => { pendingIntake = undefined; });

async function intakeKey(input: string, init: RequestInit): Promise<string | undefined> {
  if (typeof init.body !== 'string' || init.method !== 'POST') return undefined;
  const body = JSON.parse(init.body);
  if (!['register', 'resend_verification'].includes(body.mode) && !input.endsWith('/auth/password/reset/request')) return undefined;
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify({ input, mode:body.mode,email:body.email,password:body.password })));
  const fingerprint = Array.from(new Uint8Array(bytes), value=>value.toString(16).padStart(2,'0')).join('');
  if (pendingIntake?.fingerprint !== fingerprint) pendingIntake = { fingerprint, key: crypto.randomUUID() };
  return pendingIntake.key;
}

export function acceptsPassword(value: string, purpose: 'creation' | 'login'): boolean {
  try { requirePasswordInput(value, purpose); return true; } catch { return false; }
}

export async function withAuthDeadline<T>(operation: Promise<T>, timeoutMs = 120_000): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([operation, new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('request_timeout')), timeoutMs);
    })]);
  } finally {
    clearTimeout(timer);
  }
}

export async function authFetch(input: string, init: RequestInit, fetcher = fetch, timeoutMs = 20_000): Promise<Response> {
  const controller = new AbortController();
  const key = await intakeKey(input, init);
  const headers = new Headers(init.headers);
  if (key) headers.set('idempotency-key', key);
  const cancel = () => controller.abort();
  globalThis.addEventListener?.('pagehide', cancel, { once: true });
  try {
    return await withAuthDeadline((async () => {
      const response = await fetcher(input, { ...init, headers, cache: 'no-store', referrerPolicy: 'no-referrer', signal: controller.signal });
      if (!response.headers.get('content-type')?.includes('application/json')) throw new Error('network_response_invalid');
      const reader = response.body?.getReader();
      if (!reader) throw new Error('network_response_invalid');
      let size = 0;
      const parts: Uint8Array[] = [];
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > 64 * 1024) { await reader.cancel(); throw new Error('network_response_invalid'); }
        parts.push(value);
      }
      const bytes = new Uint8Array(size);
      let offset = 0;
      for (const part of parts) { bytes.set(part, offset); offset += part.length; }
      const text = new TextDecoder().decode(bytes);
      let body: unknown;
      try { body = JSON.parse(text); } catch { throw new Error('network_response_invalid'); }
      if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('network_response_invalid');
      if (key && (response.status === 202 || [400,401,403,429].includes(response.status))) pendingIntake = undefined;
      return new Response(text, { status: response.status, headers: response.headers });
    })(), timeoutMs);
  } finally {
    controller.abort();
    globalThis.removeEventListener?.('pagehide', cancel);
  }
}

export function transportErrorMessage(code: string): string | undefined {
  if (code === 'request_timeout') return 'This request took too long. Its outcome is not confirmed. Wait briefly, then use the recovery options below.';
  if (code === 'network_response_invalid') return 'The service returned an unexpected response. Please try again shortly.';
  if (code === 'password_compromised') return 'Choose a different password. This one appears in a known compromised-password list.';
  if (code === 'password_screening_unavailable') return 'We cannot safely check new passwords right now. Please try again shortly.';
  if (code === 'idempotency_outcome_unknown') return 'The earlier request is still uncertain. Wait before requesting another verification or recovery link. Do not keep submitting the same form.';
  if (code === 'idempotency_key_conflict') return 'This form changed while a request was in progress. Reload the page before trying again.';
  return undefined;
}
