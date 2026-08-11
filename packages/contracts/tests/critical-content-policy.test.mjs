import assert from 'node:assert/strict';
import test from 'node:test';
import {
  MAX_AI_ASSISTED_PUBLIC_GRAPHEMES,
  countUserPerceivedCharacters,
  enforceAdminAllowPublication,
  enforceContentDeclaration,
} from '../src/content-policy.ts';

test('public declaration policy normalizes graphemes and blocks generated content', () => {
  assert.equal(countUserPerceivedCharacters('  e\u0301  '), 1);
  assert.equal(countUserPerceivedCharacters('👩‍💻'), 1);
  assert.deepEqual(enforceContentDeclaration({ body: '  human post  ', declaredCreationMode: 'human' }), {
    body: 'human post',
    declaredCreationMode: 'human',
    declaredAuthorship: 'human',
    publicLabel: 'Human-authored',
    characterCount: 10,
  });
  const assisted = enforceContentDeclaration({ body: 'a'.repeat(MAX_AI_ASSISTED_PUBLIC_GRAPHEMES), declaredCreationMode: 'ai_assisted' });
  assert.equal(assisted.publicLabel, 'AI-assisted');
  assert.equal(assisted.characterCount, MAX_AI_ASSISTED_PUBLIC_GRAPHEMES);

  assert.throws(() => enforceContentDeclaration({ body: 'a'.repeat(MAX_AI_ASSISTED_PUBLIC_GRAPHEMES + 1), declaredCreationMode: 'ai_assisted' }), /ai_assisted_character_limit_exceeded/);
  assert.throws(() => enforceContentDeclaration({ body: 'generated', declaredCreationMode: 'ai_generated' }), /ai_generated_public_content_blocked/);
  assert.throws(() => enforceContentDeclaration({ body: '', declaredCreationMode: 'human' }), /invalid_post/);
  assert.throws(() => enforceContentDeclaration({ body: 17, declaredCreationMode: 'human' }), /invalid_post/);
  assert.throws(() => enforceContentDeclaration({ body: 'unknown mode', declaredCreationMode: 'model_output' }), /invalid_post/);
  assert.throws(() => enforceContentDeclaration({ body: 'a'.repeat(100_001), declaredCreationMode: 'human' }), /invalid_post/);
});

test('admin allow helper permits only the matching public label', () => {
  assert.equal(enforceAdminAllowPublication({
    body: 'reviewed human content',
    declaredCreationMode: 'human',
    publicLabel: 'Human-authored',
  }).publicLabel, 'Human-authored');
  assert.equal(enforceAdminAllowPublication({
    body: 'a'.repeat(MAX_AI_ASSISTED_PUBLIC_GRAPHEMES),
    declaredCreationMode: 'ai_assisted',
    publicLabel: 'AI-assisted',
  }).declaredAuthorship, 'assisted');
  assert.throws(() => enforceAdminAllowPublication({
    body: 'human content',
    declaredCreationMode: 'human',
    publicLabel: 'AI-assisted',
  }), /admin_public_label_declaration_mismatch/);
  assert.throws(() => enforceAdminAllowPublication({
    body: 'generated content',
    declaredCreationMode: 'ai_generated',
    publicLabel: 'AI-generated',
  }), /ai_generated_public_content_blocked/);
});

test('grapheme counting fails conservatively when Segmenter is unavailable', () => {
  const descriptor = Object.getOwnPropertyDescriptor(Intl, 'Segmenter');
  if (!descriptor?.configurable) return;
  Object.defineProperty(Intl, 'Segmenter', { ...descriptor, value: undefined });
  try {
    assert.equal(countUserPerceivedCharacters('e\u0301'), 1);
  } finally {
    Object.defineProperty(Intl, 'Segmenter', descriptor);
  }
});
