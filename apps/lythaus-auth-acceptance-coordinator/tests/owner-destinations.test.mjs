import assert from 'node:assert/strict';
import test from 'node:test';
import { emptyDestination, readDestination, reserveDestinationAttempt, requireDestinationOwner, destinationEmail, safeDestination } from '../src/owner-destinations.ts';

const binding = { id: '019bced0-0000-7000-8000-000000000001', release_sha: 'a'.repeat(40), candidate_version: '11111111-1111-4111-8111-111111111111' };
test('pending destinations contain no fabricated recipient and references are random per run/slot', () => {
  const primary = emptyDestination(binding, 'primary'), secondary = emptyDestination(binding, 'resend');
  assert.equal(primary.email, undefined); assert.notEqual(primary.reference, secondary.reference);
  assert.deepEqual(readDestination(JSON.stringify(primary), binding, 'primary'), primary);
  assert.deepEqual(Object.keys(safeDestination(primary)).sort(), ['reference', 'status']);
  for (const mutated of [{...binding,id:secondary.reference},{...binding,release_sha:'b'.repeat(40)},{...binding,candidate_version:secondary.reference}]) assert.throws(()=>readDestination(JSON.stringify(primary),mutated,'primary'),/binding_invalid/);
  assert.throws(()=>readDestination(JSON.stringify(primary),binding,'resend'),/binding_invalid/);
  for(const value of ['private@example.invalid','{}','null',JSON.stringify({...primary,state:'authorized'}),JSON.stringify({...primary,email:'private@example.invalid'})]) assert.throws(()=>readDestination(value,binding,'primary'));
});

test('destination syntax preserves authorized exact addresses and rejects injection or ambiguous addresses', () => {
  assert.equal(destinationEmail('Owner+private@Example.invalid'),'Owner+private@Example.invalid');
  for (const value of [null,' bad@example.invalid','a@bad..invalid','a@-bad.invalid','a@bad-.invalid','a..b@example.invalid','a@b.invalid\n','a'.repeat(65)+'@example.invalid','a@'+ 'b'.repeat(64)+'.invalid']) assert.throws(()=>destinationEmail(value));
});

test('ownership, immutable authorization and bounded retries survive concurrent attempts', () => {
  const now=Date.now(), reserved=reserveDestinationAttempt(emptyDestination(binding,'primary'),'human',now);
  assert.equal(reserved.attempts,1);
  assert.throws(()=>reserveDestinationAttempt(reserved,'human',now+1000),/rate_limited/);
  assert.throws(()=>reserveDestinationAttempt(reserved,'other',now+31000),/owner_mismatch/);
  assert.throws(()=>reserveDestinationAttempt({...reserved,attempts:5},'human',now+31000),/rate_limited/);
  const authorized={...reserved,state:'authorized',email:'private@example.invalid',authorizedAt:new Date(now).toISOString()};
  assert.equal(readDestination(JSON.stringify(authorized),binding,'primary').email,authorized.email);
  requireDestinationOwner(authorized,'human');
  assert.throws(()=>reserveDestinationAttempt(authorized,'human',now+31000),/locked/);
  assert.ok(!JSON.stringify(safeDestination(authorized)).includes('private'));
  assert.ok(!JSON.stringify(safeDestination(authorized)).includes('human'));
});
