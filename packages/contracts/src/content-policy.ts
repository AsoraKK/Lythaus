export const MAX_PUBLIC_CONTENT_GRAPHEMES = 100_000;
export const MAX_AI_ASSISTED_PUBLIC_GRAPHEMES = 249;

export type DeclaredContentCreationMode = 'human' | 'ai_assisted' | 'ai_generated';
export type PublishableContentLabel = 'Human-authored' | 'AI-assisted';

export interface ContentDeclarationDecision {
  body: string;
  declaredCreationMode: Exclude<DeclaredContentCreationMode, 'ai_generated'>;
  declaredAuthorship: 'human' | 'assisted';
  publicLabel: PublishableContentLabel;
  characterCount: number;
}

interface SegmenterLike {
  segment(input: string): Iterable<unknown>;
}

type SegmenterConstructor = new (
  locales?: string | readonly string[],
  options?: { granularity: 'grapheme' },
) => SegmenterLike;

export function countUserPerceivedCharacters(input: string): number {
  const normalized = input.normalize('NFC').trim();
  const Segmenter = (Intl as unknown as { Segmenter?: SegmenterConstructor }).Segmenter;
  if (!Segmenter) return Array.from(normalized).length;
  return Array.from(new Segmenter(undefined, { granularity: 'grapheme' }).segment(normalized)).length;
}

export function enforceContentDeclaration(input: {
  body: unknown;
  declaredCreationMode: unknown;
}): ContentDeclarationDecision {
  if (typeof input.body !== 'string') throw new Error('invalid_post');
  const body = input.body.normalize('NFC').trim();
  if (!body || countUserPerceivedCharacters(body) > MAX_PUBLIC_CONTENT_GRAPHEMES) throw new Error('invalid_post');
  if (input.declaredCreationMode === 'ai_generated') throw new Error('ai_generated_public_content_blocked');
  if (input.declaredCreationMode !== 'human' && input.declaredCreationMode !== 'ai_assisted') {
    throw new Error('invalid_post');
  }

  const characterCount = countUserPerceivedCharacters(body);
  if (input.declaredCreationMode === 'ai_assisted' && characterCount > MAX_AI_ASSISTED_PUBLIC_GRAPHEMES) {
    throw new Error('ai_assisted_character_limit_exceeded');
  }
  return {
    body,
    declaredCreationMode: input.declaredCreationMode,
    declaredAuthorship: input.declaredCreationMode === 'ai_assisted' ? 'assisted' : 'human',
    publicLabel: input.declaredCreationMode === 'ai_assisted' ? 'AI-assisted' : 'Human-authored',
    characterCount,
  };
}

export function enforceAdminAllowPublication(input: {
  body: unknown;
  declaredCreationMode: unknown;
  publicLabel?: unknown;
}): ContentDeclarationDecision {
  const declaration = enforceContentDeclaration(input);
  if (input.publicLabel !== undefined && input.publicLabel !== declaration.publicLabel) {
    throw new Error('admin_public_label_declaration_mismatch');
  }
  return declaration;
}
