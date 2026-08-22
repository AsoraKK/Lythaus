import fs from 'node:fs';
import test from 'node:test';

const source = fs.readFileSync('scripts/github/audit-repository-controls.mjs', 'utf8');

test('GitHub controls audit is read-only and never writes secret values', () => {
  for (const forbidden of ['method: \'POST\'', 'method: \'PUT\'', 'method: \'PATCH\'', 'method: \'DELETE\'', 'secrets.items.map(({ name, value })']) {
    if (source.includes(forbidden)) throw new Error(`unsafe controls audit source found: ${forbidden}`);
  }
  for (const required of ['repositorySecrets', 'repositoryVariables', 'deployKeys', 'hooks', 'installations', 'humanReviewRequired', 'mutationPerformed: false']) {
    if (!source.includes(required)) throw new Error(`missing controls audit field: ${required}`);
  }
});
