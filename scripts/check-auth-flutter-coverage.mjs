import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const required = [
  'lib/core/network/dio_client.dart',
  'lib/features/auth/application/auth_service.dart',
  'lib/features/auth/application/auth_providers.dart',
  'lib/features/auth/application/session_platform_native.dart',
  'lib/features/auth/domain/password_policy.dart',
  'lib/features/auth/domain/auth_failure.dart',
  'lib/features/auth/presentation/auth_choice_screen.dart',
];
const reports = readFileSync(process.argv[2] ?? 'coverage/lcov.info', 'utf8').split('end_of_record');
for (const file of required) {
  const report = reports.find(entry => entry.match(/^SF:(.*)$/m)?.[1].replaceAll('\\', '/').trim() === file);
  assert.ok(report, `Missing critical authentication coverage: ${file}`);
  const lines = [...report.matchAll(/^DA:\d+,(\d+)/gm)].map(match => Number(match[1]));
  assert.ok(lines.length > 0, `Empty critical authentication coverage: ${file}`);
  const percentage = 100 * lines.filter(count => count > 0).length / lines.length;
  console.log(`${file}: ${percentage.toFixed(2)}% line coverage`);
  assert.ok(percentage >= 80, `${file} must retain at least 80% coverage independently of aggregate gates`);
}
