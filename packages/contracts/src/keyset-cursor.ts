export interface KeysetCursor {
  timestamp: string;
  id: string;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function encodeCursor(cursor: KeysetCursor): string {
  const raw = new TextEncoder().encode(JSON.stringify(cursor));
  const binary = Array.from(raw, (byte) => String.fromCharCode(byte)).join('');
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '');
}

export function decodeCursor(value: string | null): KeysetCursor | null {
  if (!value) return null;
  try {
    const padded = value.replaceAll('-', '+').replaceAll('_', '/').padEnd(Math.ceil(value.length / 4) * 4, '=');
    const binary = atob(padded);
    const decoded = new TextDecoder().decode(Uint8Array.from(binary, (character) => character.charCodeAt(0)));
    const parsed = JSON.parse(decoded) as Partial<KeysetCursor>;
    if (typeof parsed.timestamp !== 'string' || !Number.isFinite(Date.parse(parsed.timestamp))) throw new Error('invalid');
    if (typeof parsed.id !== 'string' || !UUID_PATTERN.test(parsed.id)) throw new Error('invalid');
    return { timestamp: parsed.timestamp, id: parsed.id };
  } catch {
    throw new Error('invalid_cursor');
  }
}

export function pageRequest(url: URL, maximum = 50, defaultLimit = 25): { limit: number; cursor: KeysetCursor | null } {
  const requestedLimit = Number(url.searchParams.get('limit') ?? defaultLimit);
  if (!Number.isInteger(requestedLimit) || requestedLimit < 1) throw new Error('invalid_page_limit');
  return {
    limit: Math.min(maximum, requestedLimit),
    cursor: decodeCursor(url.searchParams.get('cursor')),
  };
}
