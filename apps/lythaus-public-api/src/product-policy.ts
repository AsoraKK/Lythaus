export {
  countUserPerceivedCharacters,
  enforceContentDeclaration,
  type ContentDeclarationDecision,
} from '@lythaus/contracts';

export interface KeysetCursor {
  timestamp: string;
  id: string;
}

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
    if (typeof parsed.id !== 'string' || !/^[0-9a-f-]{36}$/i.test(parsed.id)) throw new Error('invalid');
    return { timestamp: parsed.timestamp, id: parsed.id };
  } catch {
    throw new Error('invalid_cursor');
  }
}

export function pageRequest(url: URL, maximum = 50): { limit: number; cursor: KeysetCursor | null } {
  const requestedLimit = Number(url.searchParams.get('limit') ?? 25);
  if (!Number.isInteger(requestedLimit) || requestedLimit < 1) throw new Error('invalid_page_limit');
  return {
    limit: Math.min(maximum, requestedLimit),
    cursor: decodeCursor(url.searchParams.get('cursor')),
  };
}

export interface CustomFeedRule {
  topic?: string;
  regionCode?: string;
}

export function normalizeCustomFeedRules(input: unknown): readonly CustomFeedRule[] {
  if (!Array.isArray(input) || input.length > 20) throw new Error('invalid_custom_feed_rules');
  return input.map((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) throw new Error('invalid_custom_feed_rule');
    const candidate = item as Record<string, unknown>;
    if (Object.keys(candidate).some((key) => !['topic', 'regionCode'].includes(key))) throw new Error('invalid_custom_feed_rule');
    const topic = candidate.topic;
    const regionCode = candidate.regionCode;
    if (topic !== undefined && (typeof topic !== 'string' || !/^[\p{L}\p{N} _.-]{1,80}$/u.test(topic))) throw new Error('invalid_custom_feed_rule');
    if (regionCode !== undefined && (typeof regionCode !== 'string' || !/^[A-Z0-9-]{2,20}$/u.test(regionCode))) throw new Error('invalid_custom_feed_rule');
    if (!topic && !regionCode) throw new Error('invalid_custom_feed_rule');
    return Object.freeze({
      ...(typeof topic === 'string' ? { topic } : {}),
      ...(typeof regionCode === 'string' ? { regionCode } : {}),
    });
  });
}

export function reputationBand(level: number): 'new' | 'accountable' | 'trusted' | 'established' {
  if (level >= 4) return 'established';
  if (level >= 3) return 'trusted';
  if (level >= 1) return 'accountable';
  return 'new';
}
