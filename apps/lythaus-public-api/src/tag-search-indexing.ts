import {
  extractHashtags,
  TAG_SEARCH_PROPOSED_MAX_CANDIDATES_PER_REQUEST,
  TAG_SEARCH_PROPOSED_MAX_DISTINCT_TAGS_PER_POST,
  TAG_SEARCH_PROPOSAL_VERSION,
} from './tag-search-policy.ts';

interface TagIndexWriter {
  query(text: string, values?: unknown[]): Promise<unknown>;
}

export function tagSearchMaxDistinctTags(configured?: string): number {
  if (configured === undefined || configured === '') return TAG_SEARCH_PROPOSED_MAX_DISTINCT_TAGS_PER_POST;
  const parsed = Number(configured);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 128) throw new Error('tag_search_unavailable');
  return parsed;
}

export function tagSearchCandidateScanLimit(configured?: string): number {
  if (configured === undefined || configured === '') return TAG_SEARCH_PROPOSED_MAX_CANDIDATES_PER_REQUEST;
  const parsed = Number(configured);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 5000) throw new Error('tag_search_unavailable');
  return parsed;
}

export async function maintainPostTagIndex(
  client: TagIndexWriter,
  postId: string,
  body: string,
  maxDistinctTags: number,
): Promise<void> {
  const extracted = extractHashtags(body, maxDistinctTags);
  await client.query(
    `SELECT feed.write_post_tag_search_index($1::uuid, $2::text[], $3::integer, $4::boolean, $5::text)`,
    [postId, extracted.tokens, extracted.observedDistinctCount, extracted.complete, TAG_SEARCH_PROPOSAL_VERSION],
  );
}
