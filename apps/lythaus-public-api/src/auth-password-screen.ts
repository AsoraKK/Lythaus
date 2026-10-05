import { requirePasswordInput } from '@lythaus/contracts';

export type PasswordScreeningFailureReason = 'timeout' | 'network_error' | 'http_status' | 'invalid_body';

export class PasswordScreeningUnavailableError extends Error {
  readonly reasonCode: PasswordScreeningFailureReason;
  readonly httpStatus?: number;

  constructor(
    reasonCode: PasswordScreeningFailureReason,
    httpStatus?: number,
  ) {
    super('password_screening_unavailable');
    this.name = 'PasswordScreeningUnavailableError';
    this.reasonCode = reasonCode;
    if (httpStatus !== undefined) this.httpStatus = httpStatus;
  }
}

export function passwordScreeningFailureLogFields(error: unknown): Record<string, string | number> {
  if (!(error instanceof PasswordScreeningUnavailableError)) return {};
  return {
    passwordScreeningFailureReason: error.reasonCode,
    ...(error.httpStatus === undefined ? {} : { passwordScreeningHttpStatus: error.httpStatus }),
  };
}

export async function requireUncompromisedPassword(
  input: unknown,
  fetcher: typeof fetch = fetch,
  timeoutMs = 5000,
): Promise<string> {
  const password = requirePasswordInput(input, 'creation');
  const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-1', new TextEncoder().encode(password))))
    .map(byte => byte.toString(16).padStart(2, '0')).join('').toUpperCase();
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let deadlineExpired = false;
  try {
    const compromised = await Promise.race([
      (async () => {
        let response: Response;
        try {
          response = await fetcher(`https://api.pwnedpasswords.com/range/${hash.slice(0, 5)}`, {
            method: 'GET', redirect: 'manual', signal: controller.signal,
            headers: { 'Add-Padding': 'true', 'User-Agent': 'Lythaus-password-screening' },
          });
        } catch {
          throw new PasswordScreeningUnavailableError(deadlineExpired ? 'timeout' : 'network_error');
        }
        if (!response.ok) throw new PasswordScreeningUnavailableError('http_status', response.status);
        let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
        try {
          reader = response.body?.getReader();
        } catch {
          throw new PasswordScreeningUnavailableError('invalid_body');
        }
        if (!reader) throw new PasswordScreeningUnavailableError('invalid_body');
        const decoder = new TextDecoder();
        let data = '';
        while (true) {
          let chunk: ReadableStreamReadResult<Uint8Array>;
          try {
            chunk = await reader.read();
          } catch {
            throw new PasswordScreeningUnavailableError(deadlineExpired ? 'timeout' : 'network_error');
          }
          if (chunk.done) break;
          try {
            data += decoder.decode(chunk.value, { stream: true });
          } catch {
            throw new PasswordScreeningUnavailableError('invalid_body');
          }
          if (data.length > 256 * 1024) {
            try { await reader.cancel(); } catch {}
            throw new PasswordScreeningUnavailableError('invalid_body');
          }
        }
        try {
          data += decoder.decode();
        } catch {
          throw new PasswordScreeningUnavailableError('invalid_body');
        }
        const lines = data.trim().split(/\r?\n/);
        if (!lines.length || lines.some(line => !/^[A-F0-9]{35}:\d{1,12}$/.test(line))) {
          throw new PasswordScreeningUnavailableError('invalid_body');
        }
        return lines.some(line => line.slice(0, 35) === hash.slice(5) && Number(line.slice(36)) > 0);
      })(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          deadlineExpired = true;
          controller.abort();
          reject(new PasswordScreeningUnavailableError('timeout'));
        }, timeoutMs);
      }),
    ]);
    if (compromised) throw new Error('password_compromised');
    return password;
  } catch (error) {
    if (error instanceof Error && error.message === 'password_compromised') throw error;
    if (error instanceof PasswordScreeningUnavailableError) throw error;
    throw new PasswordScreeningUnavailableError(deadlineExpired ? 'timeout' : 'network_error');
  } finally {
    clearTimeout(timer);
    controller.abort();
  }
}
