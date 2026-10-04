import 'package:lythaus_api_client/lythaus_api_client.dart';
import 'package:test/test.dart';

void main() {
  const appealId = '01a0fdaa-a976-7c98-8c5c-0cd6d78ff5d5';
  const instant = '2026-10-02T12:00:00.000Z';

  test('community ballot request retains its revision and policy reason', () {
    final wire = <String, Object>{
      'choice': 'retain',
      'reasonCode': 'rule_applies',
      'expectedRevision': 2,
      'contextAcknowledged': true,
    };
    final request = standardSerializers.deserializeWith(
      GovernanceAppealVoteRequest.serializer,
      wire,
    )!;
    final ballot = request.oneOf.value as CommunityBallotRequest;
    expect(ballot.expectedRevision, 2);
    expect(ballot.contextAcknowledged, isTrue);
    expect(
      standardSerializers.serializeWith(
        GovernanceAppealVoteRequest.serializer,
        request,
      ),
      wire,
    );
  });

  test('historical votes retain the legacy request type', () {
    final request = standardSerializers.deserializeWith(
      GovernanceAppealVoteRequest.serializer,
      {'decision': 'uphold'},
    )!;
    expect(request.oneOf.value, isA<LegacyAppealVoteRequest>());
    expect(
      standardSerializers.serializeWith(
        GovernanceAppealVoteRequest.serializer,
        request,
      ),
      {'decision': 'uphold'},
    );
  });

  test('private review decodes nullable tally and the own ballot only', () {
    final response = standardSerializers.deserializeWith(
      AppealDetailResponse.serializer,
      {
        'appeal': {
          'appealId': appealId,
          'policyVersion': 'lythaus-monthly-rewards-2026-10-v1',
          'rulesVersion': 'synthetic-approved-test',
          'state': 'open',
          'reviewClass': 'standard',
          'opensAt': instant,
          'closesAt': '2026-10-04T12:00:00.000Z',
          'extensions': 0,
          'question':
              'Was the challenged rule correctly applied to this content version?',
          'ownBallot': {
            'revision': 2,
            'choice': 'retain',
            'reason_code': 'rule_applies',
            'cast_at': instant,
          },
          'outcome': null,
          'evidence': {
            'preview': 'Safe redacted text',
            'ruleContext': 'Apply the rule, not agreement with the opinion.',
            'version': appealId,
            'evidenceHash': '0' * 64,
          },
        },
      },
    )!;
    final detail = response.appeal.oneOf.value as CommunityAppealDetail;
    expect(detail.appealId, appealId);
    expect(detail.ownBallot?.revision, 2);
    expect(detail.outcome, isNull);
    expect(detail.evidence?.preview, 'Safe redacted text');
  });

  test('historical appeal detail retains its original policy label', () {
    final response = standardSerializers.deserializeWith(
      AppealDetailResponse.serializer,
      {
        'appeal': {
          'id': appealId,
          'case_id': appealId,
          'state': 'open',
          'risk_class': 'standard',
          'policy_version': 'appeals-v1.0.0',
          'created_at': instant,
        },
      },
    )!;
    final detail = response.appeal.oneOf.value as AppealDetail;
    expect(detail.policyVersion, 'appeals-v1.0.0');
  });
}
