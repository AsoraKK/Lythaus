export const TAG_SEARCH_PROPOSAL_VERSION = 'exact-token-proposal-v3';
export const TAG_SEARCH_PROPOSED_MAX_DISTINCT_TAGS_PER_POST = 16;
export const TAG_SEARCH_PROPOSED_MAX_CANDIDATES_PER_REQUEST = 1000;
export const TAG_SEARCH_MAX_TRACKED_DISTINCT_TAGS_PER_POST = 50_000;

export interface ExtractedHashtags {
  tokens: string[];
  observedDistinctCount: number;
  complete: boolean;
  exceedsLimit: boolean;
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
 * Proposed body-token semantics. The 16-tag search cap is unapproved. The
 * extractor keeps the full bounded token set so an over-limit legacy post
 * can be excluded as one unit without disabling unrelated searches.
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
    if (tokens.size > TAG_SEARCH_MAX_TRACKED_DISTINCT_TAGS_PER_POST) {
      return {
        tokens: [],
        observedDistinctCount: TAG_SEARCH_MAX_TRACKED_DISTINCT_TAGS_PER_POST + 1,
        complete: false,
        exceedsLimit: true,
      };
    }
  }

  return {
    tokens: [...tokens].sort(),
    observedDistinctCount: tokens.size,
    complete: true,
    exceedsLimit: tokens.size > maxDistinctTags,
  };
}

export function enforcePostTagLimit(body: string, maxDistinctTags = TAG_SEARCH_PROPOSED_MAX_DISTINCT_TAGS_PER_POST): ExtractedHashtags {
  const extracted = extractHashtags(body, maxDistinctTags);
  if (!extracted.complete || extracted.exceedsLimit) throw new Error('post_tag_limit_exceeded');
  return extracted;
}
