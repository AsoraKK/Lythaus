import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import ts from 'typescript';
import { parseSupportFeedbackPolicy, parseSupportSubmission, projectMemberSupportRequest, projectOwnerSupportRequest } from '../src/support-feedback.ts';

const policy = () => ({
  limits: { titleBytes: 64, detailBytes: 256, stepsBytes: 128, contextBytes: 32, memberMessageBytes: 128 },
  categories: { problem: ['account', 'display'], suggestion: ['navigation', 'accessibility'] },
  states: { problem: ['submitted', 'investigating'], suggestion: ['submitted', 'reviewing'] },
});
const problem = () => ({ kind: 'problem', category: 'display', title: '  Settings text is clipped  ', actual: 'Last line is hidden.',
  expected: 'All text should be visible.', reproductionSteps: 'Open settings with large text.', appVersion: 'local-fixture', platform: 'web' });
const suggestion = () => ({ kind: 'suggestion', category: 'navigation', title: 'Clearer Help destinations', improvement: 'Use separate problem and suggestion forms.', benefit: 'Members can find the right history.' });
const memberId = '01900000-0000-7000-8000-000000000001';
const otherId = '01900000-0000-7000-8000-000000000002';
const snapshot = (submission = problem()) => ({ ...submission, id: '01900000-0000-7000-8000-000000000003', submitterId: memberId,
  revision: 1, state: 'submitted', createdAt: '2026-10-03T10:00:00.000001Z', updatedAt: '2026-10-03T10:00:01Z', memberMessage: null });
const throws = (work, code) => assert.throws(work, error => error.message === code);
const invalidSubmission = work => throws(work, 'support_feedback_submission_invalid');
const invalidPolicy = work => throws(work, 'support_feedback_policy_invalid');
const invalidRecord = work => throws(work, 'support_feedback_record_invalid');

test('problem and suggestion submissions are distinct, trimmed, immutable plain-text DTOs', () => {
  const parsedProblem = parseSupportSubmission(problem(), policy());
  assert.deepEqual(parsedProblem, { ...problem(), title: 'Settings text is clipped' });
  assert.equal(parsedProblem.kind, 'problem');
  assert.equal(Object.isFrozen(parsedProblem), true);
  const parsedSuggestion = parseSupportSubmission(suggestion(), policy());
  assert.deepEqual(parsedSuggestion, suggestion());
  assert.equal(Object.isFrozen(parsedSuggestion), true);
  const minimal = problem();
  for (const field of ['reproductionSteps', 'appVersion', 'platform']) delete minimal[field];
  assert.deepEqual(parseSupportSubmission(minimal, policy()), { kind: 'problem', category: 'display', title: 'Settings text is clipped', actual: minimal.actual, expected: minimal.expected });
  assert.equal(parseSupportSubmission({ ...suggestion(), improvement: '<script>plain text</script>' }, policy()).improvement, '<script>plain text</script>');
});

test('all identity, authorization, owner, reward and injected policy fields are rejected instead of silently dropped', () => {
  for (const field of ['id', 'userId', 'submitterId', 'submitter_id', 'email', 'ownerId', 'role', 'isOwner', 'state', 'revision',
    'createdAt', 'updatedAt', 'memberMessage', 'priority', 'privateNotes', 'evidence', 'canonicalDuplicateId', 'rewardPoints', 'quarterKey', 'policy', 'attachments', 'password', 'unexpected']) {
    for (const input of [problem(), suggestion()]) invalidSubmission(() => parseSupportSubmission({ ...input, [field]: 'PRIVATE_SENTINEL' }, policy()));
  }
});

test('missing, ambiguous, mixed and coerced workflow kinds fail closed', () => {
  for (const kind of [undefined, null, true, 1, '', 'Problem', 'problems', 'problem,suggestion', ['problem'], { toString: () => 'problem' }]) {
    invalidSubmission(() => parseSupportSubmission({ ...problem(), kind }, policy()));
  }
  invalidSubmission(() => parseSupportSubmission({ ...problem(), ...suggestion() }, policy()));
  invalidSubmission(() => parseSupportSubmission({ ...suggestion(), actual: 'problem detail' }, policy()));
  invalidSubmission(() => parseSupportSubmission({ ...problem(), kind: 'suggestion' }, policy()));
  for (const input of [null, [], 1, '', new Date(), Object.create(problem())]) invalidSubmission(() => parseSupportSubmission(input, policy()));
});

test('policy must be fully supplied with exact fields, positive safe limits and distinct per-kind code lists', () => {
  for (const value of [undefined, null, {}, [], true, { ...policy(), awardPoints: 150 }]) invalidPolicy(() => parseSupportFeedbackPolicy(value));
  for (const field of ['limits', 'categories', 'states']) { const value = policy(); delete value[field]; invalidPolicy(() => parseSupportFeedbackPolicy(value)); }
  for (const field of Object.keys(policy().limits)) {
    const missing = policy(); delete missing.limits[field]; invalidPolicy(() => parseSupportFeedbackPolicy(missing));
    for (const limit of [undefined, null, true, '64', 0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
      const value = policy(); value.limits[field] = limit; invalidPolicy(() => parseSupportFeedbackPolicy(value));
    }
  }
  const extra = policy(); extra.limits.defaultBytes = 64; invalidPolicy(() => parseSupportFeedbackPolicy(extra));
  for (const section of ['categories', 'states']) for (const kind of ['problem', 'suggestion']) {
    for (const value of [undefined, [], ['x', 'x'], [''], ['x y'], ['PRIVATE_SENTINEL@example.invalid'], ['x'.repeat(65)], ['x', 1], ['x', null], new Array(1)]) {
      const input = policy(); input[section][kind] = value; invalidPolicy(() => parseSupportFeedbackPolicy(input));
    }
    const extraKind = policy(); extraKind[section].bug = ['x']; invalidPolicy(() => parseSupportFeedbackPolicy(extraKind));
  }
  invalidPolicy(() => parseSupportSubmission(problem(), undefined));
  invalidPolicy(() => projectMemberSupportRequest(snapshot(), memberId, undefined));
  invalidPolicy(() => projectOwnerSupportRequest(snapshot(), undefined));
});

test('validated policy is a detached deeply frozen snapshot, and every entrypoint revalidates supplied configuration', () => {
  const input = policy(), parsed = parseSupportFeedbackPolicy(input);
  input.limits.titleBytes = 1; input.categories.problem[0] = 'changed'; input.states.problem.push('closed');
  assert.equal(parsed.limits.titleBytes, 64); assert.deepEqual(parsed.categories.problem, ['account', 'display']); assert.deepEqual(parsed.states.problem, ['submitted', 'investigating']);
  for (const value of [parsed, parsed.limits, parsed.categories, parsed.states, ...Object.values(parsed.categories), ...Object.values(parsed.states)]) assert.equal(Object.isFrozen(value), true);
  assert.throws(() => parsed.limits.titleBytes = 100, TypeError);
  assert.throws(() => parsed.categories.problem.push('forged'), TypeError);
  invalidSubmission(() => parseSupportSubmission(problem(), input));
  input.limits.titleBytes = NaN;
  invalidPolicy(() => parseSupportSubmission(problem(), input));
  invalidPolicy(() => projectMemberSupportRequest(snapshot(), memberId, input));
  invalidPolicy(() => projectOwnerSupportRequest(snapshot(), input));
});

test('per-kind category and state policy is enforced without inferred business defaults', () => {
  invalidSubmission(() => parseSupportSubmission({ ...problem(), category: 'navigation' }, policy()));
  invalidSubmission(() => parseSupportSubmission({ ...suggestion(), category: 'display' }, policy()));
  const alternate = policy(); alternate.categories.problem = ['custom']; alternate.states.problem = ['awaiting_reply'];
  const input = { ...problem(), category: 'custom' };
  assert.equal(parseSupportSubmission(input, alternate).category, 'custom');
  assert.equal(projectMemberSupportRequest({ ...snapshot(input), state: 'awaiting_reply' }, memberId, alternate).state, 'awaiting_reply');
  invalidRecord(() => projectOwnerSupportRequest({ ...snapshot(), state: 'reviewing' }, policy()));
  invalidRecord(() => projectMemberSupportRequest({ ...snapshot(suggestion()), state: 'investigating' }, memberId, policy()));
});

test('limits measure original UTF-8 bytes including whitespace and reject invalid Unicode/control data', () => {
  const input = policy(); input.limits.titleBytes = 4;
  for (const title of ['abcd', 'éé', '😀', '四a']) assert.equal(parseSupportSubmission({ ...suggestion(), title }, input).title, title);
  for (const title of ['abcde', 'ééa', '😀a', '四四', ' aaaa ', '😀😀']) invalidSubmission(() => parseSupportSubmission({ ...suggestion(), title }, input));
  for (const field of ['title', 'improvement', 'benefit']) for (const value of ['', ' \n\t ', null, undefined, 1, true, [], {}, '\ud800', '\udc00', 'x\ud800y', '\u0000', '\u000b', '\u007f']) {
    invalidSubmission(() => parseSupportSubmission({ ...suggestion(), [field]: value }, policy()));
  }
  for (const [field, limit] of [['actual', 'detailBytes'], ['expected', 'detailBytes'], ['reproductionSteps', 'stepsBytes'], ['appVersion', 'contextBytes'], ['platform', 'contextBytes']]) {
    const configured = policy(); configured.limits[limit] = 4;
    const valid = { ...problem(), actual: 'fine', expected: 'fine', reproductionSteps: 'step', appVersion: 'v1', platform: 'web', [field]: 'éé' };
    assert.equal(parseSupportSubmission(valid, configured)[field], 'éé');
    invalidSubmission(() => parseSupportSubmission({ ...valid, [field]: 'ééx' }, configured));
    invalidSubmission(() => parseSupportSubmission({ ...valid, [field]: undefined }, configured));
  }
  assert.equal(parseSupportSubmission({ ...suggestion(), improvement: 'line1\nline2\tend' }, policy()).improvement, 'line1\nline2\tend');
});

test('JSON prototype keys, class instances, symbols, non-enumerable fields and accessors cannot enter contracts', () => {
  for (const key of ['__proto__', 'constructor', 'prototype']) {
    const input = JSON.parse(JSON.stringify({ ...suggestion(), [key]: { forged: true } }));
    invalidSubmission(() => parseSupportSubmission(input, policy()));
  }
  assert.equal({}.forged, undefined);
  let reads = 0;
  const accessor = { ...problem() }; Object.defineProperty(accessor, 'title', { enumerable: true, get() { reads += 1; throw new Error('PRIVATE_SENTINEL'); } });
  invalidSubmission(() => parseSupportSubmission(accessor, policy())); assert.equal(reads, 0);
  const hidden = { ...suggestion() }; Object.defineProperty(hidden, 'ownerId', { value: otherId }); invalidSubmission(() => parseSupportSubmission(hidden, policy()));
  const symbol = { ...suggestion(), [Symbol('owner')]: otherId }; invalidSubmission(() => parseSupportSubmission(symbol, policy()));
  const arrayAccessor = policy(); Object.defineProperty(arrayAccessor.categories.problem, '0', { enumerable: true, get() { reads += 1; return 'display'; } });
  invalidPolicy(() => parseSupportFeedbackPolicy(arrayAccessor)); assert.equal(reads, 0);
  const policyAccessor = policy(); Object.defineProperty(policyAccessor.limits, 'titleBytes', { enumerable: true, get() { reads += 1; return 64; } });
  invalidPolicy(() => parseSupportFeedbackPolicy(policyAccessor)); assert.equal(reads, 0);
  assert.equal(parseSupportSubmission(Object.assign(Object.create(null), suggestion()), policy()).kind, 'suggestion');
});

test('member and owner projections use fixed allowlists; private notes/evidence/priority/duplicate/credential fields never escape', () => {
  for (const input of [problem(), suggestion()]) {
    const row = { ...snapshot(input), privateNotes: [{ body: 'PRIVATE_SENTINEL' }], evidence: { secret: 'PRIVATE_SENTINEL' }, priority: 'PRIVATE_SENTINEL',
      canonicalDuplicateId: otherId, duplicate: { submitterId: otherId, body: 'PRIVATE_SENTINEL' }, email: 'PRIVATE_SENTINEL', passwordHash: 'PRIVATE_SENTINEL',
      ownerId: otherId, internalReason: 'PRIVATE_SENTINEL', metadata: { private: 'PRIVATE_SENTINEL' }, rewardPoints: 150, quarterKey: 'PRIVATE_SENTINEL' };
    const member = projectMemberSupportRequest(row, memberId, policy()), owner = projectOwnerSupportRequest(row, policy());
    const fields = [...Object.keys(parseSupportSubmission(input, policy())), 'id', 'revision', 'state', 'createdAt', 'updatedAt', 'memberMessage'].sort();
    assert.deepEqual(Object.keys(member).sort(), fields);
    assert.deepEqual(Object.keys(owner).sort(), [...fields, 'submitterId'].sort());
    assert.equal(member.memberMessage, null); assert.equal(owner.submitterId, memberId);
    assert.equal(member.createdAt, '2026-10-03T10:00:00.000001Z'); assert.equal(member.updatedAt, '2026-10-03T10:00:01.000000Z');
    for (const result of [member, owner]) { assert.equal(Object.isFrozen(result), true); assert.ok(!JSON.stringify(result).includes('PRIVATE_SENTINEL')); assert.ok(!JSON.stringify(result).includes(otherId)); }
    assert.ok(!JSON.stringify(member).includes(memberId));
  }
});

test('member projection rejects foreign identities uniformly and supports existing UUID identity versions', () => {
  invalidRecord(() => projectMemberSupportRequest(snapshot(), otherId, policy()));
  for (const id of [null, undefined, 1, true, {}, '', 'not-an-id']) invalidRecord(() => projectMemberSupportRequest(snapshot(), id, policy()));
  assert.equal(projectMemberSupportRequest(snapshot(), memberId.toUpperCase(), policy()).id, snapshot().id);
  const legacyId = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
  assert.equal(projectOwnerSupportRequest({ ...snapshot(), submitterId: legacyId.toUpperCase() }, policy()).submitterId, legacyId);
  assert.equal(projectMemberSupportRequest({ ...snapshot(), submitterId: legacyId }, legacyId, policy()).kind, 'problem');
});

test('mutating a source or projection cannot change another DTO or retain private object aliases', () => {
  const row = { ...snapshot(), privateNotes: { message: 'PRIVATE_SENTINEL' } };
  const member = projectMemberSupportRequest(row, memberId, policy()), owner = projectOwnerSupportRequest(row, policy());
  row.title = 'changed'; row.privateNotes.message = 'changed'; row.submitterId = otherId;
  assert.equal(member.title, 'Settings text is clipped'); assert.equal(owner.submitterId, memberId);
  for (const dto of [member, owner]) {
    assert.throws(() => dto.title = 'forged', TypeError);
    assert.throws(() => Object.assign(dto, { privateNotes: 'PRIVATE_SENTINEL' }), TypeError);
    assert.throws(() => Object.setPrototypeOf(dto, { role: 'owner' }), TypeError);
  }
  assert.equal(member.title, owner.title);
});

test('invalid records, chronology, nullable message and mixed workflow data fail closed with no private error text', () => {
  const patches = [{ id: otherId.replace('-7000-', '-4000-') }, { id: 'PRIVATE_SENTINEL' }, { submitterId: 'PRIVATE_SENTINEL' },
    { revision: 0 }, { revision: 1.5 }, { revision: '1' }, { revision: Number.MAX_SAFE_INTEGER + 1 }, { state: 'PRIVATE_SENTINEL' },
    { createdAt: '2026-02-30T00:00:00Z' }, { updatedAt: '2026-10-03T09:00:00Z' }, { updatedAt: null },
    { memberMessage: undefined }, { memberMessage: {} }, { memberMessage: '' }, { memberMessage: 'x'.repeat(129) }, { improvement: 'PRIVATE_SENTINEL' }];
  for (const patch of patches) for (const project of [row => projectMemberSupportRequest(row, memberId, policy()), row => projectOwnerSupportRequest(row, policy())]) invalidRecord(() => project({ ...snapshot(), ...patch }));
  for (const field of ['id', 'submitterId', 'revision', 'state', 'createdAt', 'updatedAt', 'memberMessage']) {
    const row = snapshot(); delete row[field]; invalidRecord(() => projectOwnerSupportRequest(row, policy()));
  }
  const message = projectMemberSupportRequest({ ...snapshot(), memberMessage: '  Please describe the affected setting.  ' }, memberId, policy());
  assert.equal(message.memberMessage, 'Please describe the affected setting.');
  const inherited = Object.create(snapshot()); invalidRecord(() => projectOwnerSupportRequest(inherited, policy()));
  let reads = 0; const row = snapshot(); Object.defineProperty(row, 'privateNotes', { enumerable: true, get() { reads += 1; return 'PRIVATE_SENTINEL'; } });
  invalidRecord(() => projectOwnerSupportRequest(row, policy())); assert.equal(reads, 0);
});

test('TypeScript enforces discriminated submissions, readonly policies/DTOs and exclusion of private fields', () => {
  const fixture = path.resolve(import.meta.dirname, 'support-feedback.virtual-typecheck.ts');
  const source = `import type { SupportSubmission, SupportFeedbackPolicy, MemberSupportRequest, OwnerSupportRequest } from '../src/support-feedback.ts';
declare const submission: SupportSubmission;
declare const member: MemberSupportRequest;
declare const owner: OwnerSupportRequest;
declare const policy: SupportFeedbackPolicy;
if (submission.kind === 'problem') {
  const actual: string = submission.actual;
  // @ts-expect-error Suggestion-only field is excluded from a problem.
  submission.benefit;
} else {
  const benefit: string = submission.benefit;
  // @ts-expect-error Problem-only field is excluded from a suggestion.
  submission.actual;
}
const ownerSubmitter: string = owner.submitterId;
// @ts-expect-error A member has no submitter identity field.
member.submitterId;
// @ts-expect-error Private triage priority is excluded.
owner.priority;
// @ts-expect-error Evidence is excluded.
owner.evidence;
// @ts-expect-error Private notes are excluded.
member.privateNotes;
// @ts-expect-error Cross-member duplicate references are excluded.
member.canonicalDuplicateId;
// @ts-expect-error DTO mutation is forbidden.
member.title = 'forged';
// @ts-expect-error Policy mutation is forbidden.
policy.limits.titleBytes = 99;
// @ts-expect-error Category arrays are readonly.
policy.categories.problem.push('forged');
// @ts-expect-error Ambiguous kinds are not permitted.
const mixed: SupportSubmission = { kind: 'problem,suggestion', category: 'x', title: 'x', improvement: 'x', benefit: 'x' };
`;
  const options = { strict: true, noEmit: true, skipLibCheck: true, types: [], target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler, allowImportingTsExtensions: true };
  const host = ts.createCompilerHost(options), read = host.getSourceFile.bind(host);
  host.getSourceFile = (file, ...args) => file === fixture ? ts.createSourceFile(file, source, ts.ScriptTarget.ES2022, true) : read(file, ...args);
  const diagnostics = ts.getPreEmitDiagnostics(ts.createProgram([fixture], options, host));
  assert.equal(diagnostics.length, 0, diagnostics.map(item => ts.flattenDiagnosticMessageText(item.messageText, '\n')).join('\n'));
});

test('hostile/revoked reflection traps cannot expose private exception details', () => {
  const hostile = new Proxy({}, { getPrototypeOf() { throw new Error('PRIVATE_SENTINEL'); } });
  const revoked = Proxy.revocable({}, {}); revoked.revoke();
  const descriptorTrap = new Proxy(snapshot(), { getOwnPropertyDescriptor() { throw new Error('PRIVATE_SENTINEL'); } });
  for (const input of [hostile, revoked.proxy, descriptorTrap]) {
    invalidPolicy(() => parseSupportFeedbackPolicy(input));
    invalidSubmission(() => parseSupportSubmission(input, policy()));
    invalidRecord(() => projectMemberSupportRequest(input, memberId, policy()));
    invalidRecord(() => projectOwnerSupportRequest(input, policy()));
  }
  const listTrap = policy(); listTrap.categories.problem = new Proxy(['display'], { getOwnPropertyDescriptor() { throw new Error('PRIVATE_SENTINEL'); } });
  invalidPolicy(() => parseSupportFeedbackPolicy(listTrap));
  invalidPolicy(() => projectOwnerSupportRequest(snapshot(), listTrap));
});

test('descriptor snapshots prevent dynamic Proxy reads from changing identities, validated fields or policy lengths', () => {
  let reads = 0;
  const trap = target => new Proxy(target, { get() { reads += 1; throw new Error('PRIVATE_SENTINEL'); } });
  assert.deepEqual(parseSupportSubmission(trap(problem()), policy()), parseSupportSubmission(problem(), policy()));
  assert.deepEqual(projectMemberSupportRequest(trap(snapshot()), memberId, policy()), projectMemberSupportRequest(snapshot(), memberId, policy()));
  const configured = policy(); configured.limits = trap(configured.limits); configured.categories.problem = trap(configured.categories.problem);
  assert.deepEqual(parseSupportFeedbackPolicy(trap(configured)), parseSupportFeedbackPolicy(policy()));
  const foreign = new Proxy({ ...snapshot(), submitterId: otherId }, { get(target, key) { reads += 1; return key === 'submitterId' ? memberId : Reflect.get(target, key); } });
  invalidRecord(() => projectMemberSupportRequest(foreign, memberId, policy()));
  assert.equal(projectOwnerSupportRequest(foreign, policy()).submitterId, otherId);
  const changingId = new Proxy(snapshot(), { get(target, key) { reads += 1; return key === 'id' ? 'not-a-uuid' : Reflect.get(target, key); } });
  assert.equal(projectOwnerSupportRequest(changingId, policy()).id, snapshot().id);
  const invalidId = new Proxy({ ...snapshot(), id: 'not-a-uuid' }, { get(target, key) { reads += 1; return key === 'id' ? snapshot().id : Reflect.get(target, key); } });
  invalidRecord(() => projectOwnerSupportRequest(invalidId, policy()));
  assert.equal(reads, 0);
});
