export {
  countUserPerceivedCharacters,
  decodeCursor,
  encodeCursor,
  enforceContentDeclaration,
  pageRequest,
  type ContentDeclarationDecision,
  type KeysetCursor,
} from '@lythaus/contracts';

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
