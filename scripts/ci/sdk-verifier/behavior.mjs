import { spawnSync } from 'node:child_process';

const tests = ['privacy_status_serialization_test.dart', 'community_appeal_serialization_test.dart', 'admin_mutation_admission_test.dart', 'support_feedback_serialization_test.dart', 'activity_measurement_serialization_test.dart', 'monthly_rewards_preparation_serialization_test.dart', 'canonical_local_package_behavior_test.dart'];
const result = spawnSync('/tools/flutter/bin/cache/dart-sdk/bin/dart', ['test', '--reporter=json', ...tests.map(file => `test/${file}`)], { cwd: '/work', encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
if (result.error) throw result.error;
process.stdout.write(result.stdout);
process.stderr.write(result.stderr);
process.exitCode = result.status ?? 1;
