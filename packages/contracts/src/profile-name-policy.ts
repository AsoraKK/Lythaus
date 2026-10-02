export const PROFILE_NAME_MAX_LENGTH = 160;

const disallowedWords = new Set(['fuck', 'shit', 'bitch', 'asshole', 'bastard']);
const separators = /[\s.,!?;:_@/\\|"'()[\]{}<>+=~`#$%^&*\-\u2010-\u2015\u2018-\u201f\u2022]+/u;

export function isDisallowedProfileName(value: string): boolean {
  const folded = value.replace(/[\uff01-\uff5e]/gu, character => String.fromCharCode(character.charCodeAt(0) - 0xfee0))
    .replace(/[\u00ad\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff]/gu, '').toLowerCase();
  return folded.split(separators).some(word => disallowedWords.has(word));
}

export function normalizeProfileName(value: unknown, field: 'display_name' | 'accountability_name' = 'display_name'): string {
  if (typeof value !== 'string') throw new Error(`invalid_${field}`);
  const name = value.normalize('NFC').trim();
  if (name.length < (field === 'accountability_name' ? 2 : 1) || name.length > PROFILE_NAME_MAX_LENGTH
    || /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/u.test(name) || isDisallowedProfileName(name)) {
    throw new Error(`invalid_${field}`);
  }
  return name;
}
