import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lythaus_api_client/lythaus_api_client.dart' as api;
import 'package:lythaus/features/auth/application/auth_providers.dart';
import 'package:lythaus/features/auth/application/auth_session_revision.dart';
import 'package:lythaus/features/auth/domain/user.dart';
import 'package:lythaus/features/rewards/application/reward_providers.dart';
import 'package:lythaus/features/rewards/application/monthly_api_serializers.dart';

final monthlyTestSession = StateProvider<User?>(
  (ref) => monthlyTestUser('owner-a'),
);
User monthlyTestUser(String id) => User(
  id: id,
  email: '$id@example.invalid',
  role: UserRole.user,
  tier: UserTier.bronze,
  reputationScore: 0,
  createdAt: DateTime.utc(2026),
  lastLoginAt: DateTime.utc(2026),
);
String monthlyTestMonth() {
  final now = DateTime.now().toUtc();
  return '${now.year}-${now.month.toString().padLeft(2, '0')}';
}

const monthlyDisabledReadiness = <String, Object?>{
  'state': 'disabled',
  'reasonCode': 'activation_not_approved',
  'responseVersion': 'monthly-rewards-response-v2-preparation',
  'policyVersion': 'lythaus-monthly-rewards-2026-10-v2',
  'catalogueHash':
      '26213abccce99ee51be6c0623406c28aaa7d39ed3ea3b4ac630b7cffd859db67',
  'dataVersion': 2,
  'maximumSourceMonth': 13650,
  'preparationOnly': true,
  'runtimeActivationAllowed': false,
  'appliedPoints': 0,
};
Map<String, Object?> monthlyStatusWire({bool confirmed = false}) => {
  'state': 'pending',
  'reasonCode': 'approval_unavailable',
  'effectiveMonth': confirmed ? '2026-10' : null,
  'currentLevel': confirmed ? 3 : null,
  'sourceMonth': confirmed ? '2026-09' : null,
  'sourceScore': confirmed ? 4000 : null,
  'snapshot': {
    'state': confirmed ? 'confirmed' : 'unavailable',
    'reasonCode': confirmed ? 'source_month_assessed' : 'approval_unavailable',
    'effectiveMonth': '2026-10',
    if (confirmed) ...{
      'policyVersion': 'lythaus-monthly-rewards-2026-10-v1',
      'sourceMonth': '2026-09',
      'snapshotId': '018f0000-0000-7000-8000-000000000021',
      'revision': 1,
      'sourceRevision': 1,
      'sourceScore': 4000,
      'level': 3,
    },
  },
  'selection': {'state': 'unavailable', 'reasonCode': 'approval_unavailable'},
  'responsePreparation': monthlyDisabledReadiness,
  'preparedResponse': null,
};

Map<String, Object?> monthlySnapshotStatusWire({
  String state = 'shadow',
  String policyVersion = 'lythaus-monthly-rewards-2026-10-v1',
  int sourceScore = 4000,
  int revision = 1,
  int level = 3,
}) {
  final wire = monthlyStatusWire(confirmed: true);
  wire['sourceScore'] = sourceScore;
  wire['currentLevel'] = level;
  wire['snapshot'] = {
    'state': state,
    'reasonCode': 'source_month_assessed',
    'effectiveMonth': '2026-10',
    'sourceMonth': '2026-09',
    'snapshotId': '018f0000-0000-7000-8000-000000000021',
    'revision': revision,
    'sourceRevision': revision,
    'sourceScore': sourceScore,
    'level': level,
    'policyVersion': policyVersion,
    if (policyVersion == 'lythaus-monthly-rewards-2026-10-v2') ...{
      'preparationOnly': true,
      'runtimeActivationAllowed': false,
      'appliedPoints': 0,
      'dataVersion': 2,
      'catalogueHash': monthlyDisabledReadiness['catalogueHash'],
      'maximumSourceMonth': 13650,
    },
  };
  return wire;
}

api.MonthlyRewardsMeResponse monthlyStatus({
  bool confirmed = false,
  Map<String, Object?>? wire,
}) => monthlyApiSerializers.deserializeWith(
  api.MonthlyRewardsMeResponse.serializer,
  wire ?? monthlyStatusWire(confirmed: confirmed),
)!;

Map<String, Object?> monthlyReportWire(
  String month, {
  Map<String, Object?>? detail,
  Map<String, Object?>? corrections,
}) => {
  'reportState': detail == null ? 'pending' : 'shadow',
  'reasonCode': detail == null ? 'assembly_pending' : null,
  'sourceMonth': month,
  'effectiveMonth': '2026-11',
  'policyVersion': 'lythaus-monthly-rewards-2026-10-v1',
  'levelAuthority': {
    'state': 'unavailable',
    'reasonCode': 'approval_unavailable',
    'effectiveMonth': null,
    'sourceMonth': null,
    'sourceScore': null,
    'level': null,
    'levelKind': null,
  },
  'corrections':
      corrections ??
      {'sourceRevisions': <Object?>[], 'effectiveSnapshots': <Object?>[]},
  'report': detail,
  'responsePreparation': monthlyDisabledReadiness,
  'preparedResponse': null,
};
api.MonthlyReputationReportResponse monthlyReport(
  String month, {
  Map<String, Object?>? detail,
  Map<String, Object?>? corrections,
  Map<String, Object?>? wire,
}) => monthlyApiSerializers.deserializeWith(
  api.MonthlyReputationReportResponse.serializer,
  wire ?? monthlyReportWire(month, detail: detail, corrections: corrections),
)!;

List<Override> monthlyFixtureOverrides() => [
  authSessionRevisionProvider.overrideWith(
    (ref) => AuthSessionRevision(ref.read(monthlyTestSession.notifier)),
  ),
  currentUserProvider.overrideWith((ref) => ref.watch(monthlyTestSession)),
  guestModeProvider.overrideWith((ref) => false),
  ...monthlyDataFixtureOverrides(),
];

List<Override> monthlyDataFixtureOverrides() => [
  monthlyRewardsViewProvider.overrideWith((ref) async => monthlyStatus()),
  monthlyReputationReportProvider.overrideWith(
    (ref, month) async => monthlyReport(month),
  ),
];
