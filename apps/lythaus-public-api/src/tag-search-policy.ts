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
