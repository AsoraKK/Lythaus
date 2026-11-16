import assert from 'node:assert/strict';
import test from 'node:test';
import { assertNewCoreEmptyCatalog } from '../ci/lythaus-new-core-empty-catalog.mjs';

const providerCounts = { application_schema_count: 1, application_relation_count: 2 };
const providerRow = {
  provider_schema_owner_matches: true, provider_view_count: 2,
  provider_unexpected_relation_count: 0, provider_unexpected_namespace_dependency_count: 0,
};

test('an empty local catalog needs no provider exception', async () => {
  const result = await assertNewCoreEmptyCatalog({ query() { throw new Error('unexpected_query'); } }, {
    application_schema_count: 0, application_relation_count: 0,
  });
  assert.equal(result.providerExtensionViews, 0);
});

test('only the exact two extension-owned HypoPG views qualify as provider baseline', async () => {
  const client = { async query(sql, parameters) {
    assert.deepEqual(parameters, ['pscale_extensions', 'hypopg', ['hypopg_hidden_indexes', 'hypopg_list_indexes']]);
    return { rows: [providerRow] };
  } };
  const result = await assertNewCoreEmptyCatalog(client, providerCounts);
  assert.equal(result.applicationRelations, 0);
  assert.equal(result.providerExtensionViews, 2);
});

test('unexpected schemas/relations and spoofed extension membership stop before DDL', async () => {
  for (const counts of [
    {}, { application_schema_count: 2, application_relation_count: 2 },
    { application_schema_count: 1, application_relation_count: 3 },
    { application_schema_count: 1, application_relation_count: 1 },
    { application_schema_count: 0, application_relation_count: 2 },
  ]) {
    await assert.rejects(assertNewCoreEmptyCatalog({ query() { throw new Error('unexpected_query'); } }, counts),
      /application_catalog_not_empty/);
  }
  for (const changed of [
    { provider_schema_owner_matches: false }, { provider_view_count: 1 },
    { provider_unexpected_relation_count: 1 }, { provider_unexpected_namespace_dependency_count: 1 },
  ]) {
    await assert.rejects(assertNewCoreEmptyCatalog({ async query() { return { rows: [{ ...providerRow, ...changed }] }; } },
      providerCounts), /provider_extension_baseline_mismatch/);
  }
  await assert.rejects(assertNewCoreEmptyCatalog({ async query() { return { rows: [] }; } }, providerCounts),
    /provider_extension_baseline_mismatch/);
});
