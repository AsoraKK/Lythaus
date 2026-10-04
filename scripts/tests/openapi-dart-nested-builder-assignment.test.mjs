import assert from 'node:assert/strict';
import { test } from 'node:test';
import { normalizeLevelAuthorityBuilderAssignment } from '../fix-openapi-dart-nested-builder-assignment.mjs';

const generatedSerializer = `
        case r'levelAuthority':
          final valueDes = serializers.deserialize(value) as MonthlyReputationReportResponseLevelAuthority;
          result.levelAuthority = valueDes;
          break;
        case r'corrections':
          final valueDes = serializers.deserialize(value) as MonthlyReputationReportResponseCorrections;
          result.corrections.replace(valueDes);
          break;
`;

test('normalizes the generated nested builder assignment and leaves other fields alone', () => {
  const normalized = normalizeLevelAuthorityBuilderAssignment(generatedSerializer);
  assert.match(normalized, /result\.levelAuthority\.replace\(valueDes\);/u);
  assert.match(normalized, /result\.corrections\.replace\(valueDes\);/u);
  assert.doesNotMatch(normalized, /result\.levelAuthority\s*=\s*valueDes/u);
});

test('the post-generation normalization is repeatable', () => {
  const once = normalizeLevelAuthorityBuilderAssignment(generatedSerializer);
  assert.equal(normalizeLevelAuthorityBuilderAssignment(once), once);
});

test('fails closed if the pinned generator output changes shape', () => {
  assert.throws(
    () => normalizeLevelAuthorityBuilderAssignment("case r'levelAuthority':\n          result.levelAuthority = decoded;\n"),
    /monthly_report_level_authority_generator_shape_unexpected/u,
  );
  assert.throws(
    () => normalizeLevelAuthorityBuilderAssignment('no matching generated property'),
    /monthly_report_level_authority_case_missing/u,
  );
});
