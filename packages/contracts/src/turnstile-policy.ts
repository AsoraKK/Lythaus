export interface TurnstileSiteverifyResponse {
  success?: boolean;
  hostname?: string;
  action?: string;
  'error-codes'?: unknown;
}

function configuredValues(value: string | undefined): string[] {
  return (value ?? '').split(',').map((item) => item.trim().toLowerCase()).filter(Boolean);
}

export function validateTurnstileResponse(
  result: TurnstileSiteverifyResponse,
  expectedHostnames: string | undefined,
  expectedAction?: string,
): void {
  if (result.success !== true) throw new Error('turnstile_failed');
  const hostnames = configuredValues(expectedHostnames);
  if (hostnames.length > 0 && (!result.hostname || !hostnames.includes(result.hostname.toLowerCase()))) {
    throw new Error('turnstile_failed');
  }
  const action = expectedAction?.trim();
  if (action && result.action !== action) throw new Error('turnstile_failed');
}
