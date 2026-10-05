export const TAG_SEARCH_PROPOSAL_VERSION = 'exact-token-proposal-v1';
export const TAG_SEARCH_PROPOSED_MAX_DISTINCT_TAGS_PER_POST = 16;
export const TAG_SEARCH_PROPOSED_MAX_CANDIDATES_PER_REQUEST = 1000;

export interface ExtractedHashtags {
  tokens: string[];
  observedDistinctCount: number;
  complete: boolean;
}

export function normalizeTagSearchQuery(value: unknown): string {
  if (typeof value !== 'string') throw new Error('invalid_tag_search');
  const input = value.trim();
  const rawTag = (input.startsWith('#') ? input.slice(1) : input).normalize('NFC');
  const tag = rawTag.toLowerCase().normalize('NFC');
  const length = Array.from(tag).length;
  if (length < 1 || length > 64 || !/^[\p{L}\p{N}_]+$/u.test(tag)) {
    throw new Error('invalid_tag_search');
  }
  return tag;
}

/**
 * Proposed body-token semantics. The 16-tag cap is an unapproved default;
 * callers must keep the database control row and runtime setting aligned.
 */
export function extractHashtags(body: string, maxDistinctTags = TAG_SEARCH_PROPOSED_MAX_DISTINCT_TAGS_PER_POST): ExtractedHashtags {
  if (!Number.isInteger(maxDistinctTags) || maxDistinctTags < 1 || maxDistinctTags > 128) {
    throw new Error('invalid_tag_search_policy');
  }

  const tokens = new Set<string>();
  const normalizedBody = body.normalize('NFC');
  const expression = /(^|[^\p{L}\p{N}_#])#([\p{L}\p{N}_]{1,64})(?=$|[^\p{L}\p{N}_])/gu;
  for (const match of normalizedBody.matchAll(expression)) {
    const token = match[2].toLowerCase().normalize('NFC');
    const length = Array.from(token).length;
    if (length < 1 || length > 64 || !/^[\p{L}\p{N}_]+$/u.test(token)) continue;
    tokens.add(token);
    if (tokens.size > maxDistinctTags) {
      return {
        tokens: [],
        observedDistinctCount: maxDistinctTags + 1,
        complete: false,
      };
    }
  }

  return { tokens: [...tokens].sort(), observedDistinctCount: tokens.size, complete: true };
}
