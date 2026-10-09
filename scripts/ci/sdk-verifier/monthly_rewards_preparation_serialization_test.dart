import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';
import 'package:dio/dio.dart';
import 'package:lythaus_api_client/lythaus_api_client.dart';
import 'package:test/test.dart';

final fixture =
    jsonDecode(
          File('test/monthly_rewards_preparation_wire.json').readAsStringSync(),
        )
        as Map<String, dynamic>;

Map<String, Object?> reportWire() => {
  'reportState': 'pending',
  'reasonCode': 'report_unavailable',
  'sourceMonth': '2026-12',
  'effectiveMonth': '2027-01',
  'policyVersion': 'lythaus-monthly-rewards-2026-10-v1',
  'levelAuthority': {
    'state': 'unavailable',
    'effectiveMonth': '2027-01',
    'sourceScore': null,
    'level': null,
  },
  'corrections': {
    'sourceRevisions': <Object?>[],
    'effectiveSnapshots': <Object?>[],
  },
  'report': null,
  'responsePreparation': fixture['readiness'],
  'preparedResponse': null,
};

Map<String, Object?> rewardsWire() => {
  'state': 'pending',
  'reasonCode': 'approval_unavailable',
  'effectiveMonth': null,
  'currentLevel': null,
  'sourceMonth': null,
  'sourceScore': null,
  'snapshot': {'state': 'unavailable', 'reasonCode': 'approval_unavailable'},
  'selection': {'state': 'unavailable', 'reasonCode': 'approval_unavailable'},
  'responsePreparation': fixture['readiness'],
  'preparedResponse': null,
};

class MonthlyAdapter implements HttpClientAdapter {
  final requests = <RequestOptions>[];
  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    requests.add(options);
    return ResponseBody.fromString(
      jsonEncode(
        options.path.startsWith('/reputation/') ? reportWire() : rewardsWire(),
      ),
      200,
      headers: {
        Headers.contentTypeHeader: ['application/json'],
        'cache-control': ['private, no-store'],
      },
    );
  }

  @override
  void close({bool force = false}) {}
}

void main() {
  test('legacy monthly response remains readable with new fields absent', () {
    final wire = rewardsWire()
      ..remove('responsePreparation')
      ..remove('preparedResponse')
      ..['state'] = 'ready'
      ..['reasonCode'] = null
      ..['sourceMonth'] = '2026-12'
      ..['effectiveMonth'] = '2027-01'
      ..['sourceScore'] = 13500
      ..['currentLevel'] = 5;
    final value = standardSerializers.deserializeWith(
      MonthlyRewardsMeResponse.serializer,
      wire,
    )!;
    expect(value.sourceScore, 13500);
    expect(value.currentLevel, 5);
    expect(value.responsePreparation, isNull);
    expect(value.preparedResponse, isNull);
  });

  test('disabled and unknown readiness preserve null authority and policy', () {
    for (final key in ['readiness', 'unknownReadiness']) {
      final value = standardSerializers.deserializeWith(
        MonthlyRewardsMeResponse.serializer,
        {...rewardsWire(), 'responsePreparation': fixture[key]},
      )!;
      expect(value.currentLevel, isNull);
      expect(value.sourceScore, isNull);
      expect(value.effectiveMonth, isNull);
      expect(value.preparedResponse, isNull);
      expect(value.responsePreparation!.runtimeActivationAllowed, false);
      expect(value.responsePreparation!.appliedPoints, 0);
      if (key == 'unknownReadiness') {
        expect(value.responsePreparation!.responseVersion, isNull);
        expect(value.responsePreparation!.policyVersion, isNull);
        expect(value.responsePreparation!.dataVersion, isNull);
        expect(value.responsePreparation!.maximumSourceMonth, isNull);
      }
      final encoded =
          standardSerializers.serializeWith(
                MonthlyRewardsMeResponse.serializer,
                value,
              )
              as Map;
      expect(encoded.containsKey('sourceScore'), isTrue);
      expect(encoded['sourceScore'], isNull);
      expect(
        (encoded['responsePreparation'] as Map)['state'],
        key == 'readiness' ? 'disabled' : 'unavailable',
      );
    }
  });

  test(
    'typed prepared report separates corrected progress and fixed projection',
    () {
      final value = standardSerializers.deserializeWith(
        MonthlyReputationReportResponsePreparation.serializer,
        fixture['report'],
      )!;
      expect(value.report!.total!.sourceScore, 13650);
      expect(value.report!.sourceRevision, 2);
      expect(value.snapshotProjection!.sourceScore, 0);
      expect(value.snapshotProjection!.sourceRevision, 1);
      expect(value.levelAuthority.sourceScore, isNull);
      expect(value.levelAuthority.level, isNull);
      expect(value.runtimeActivationAllowed, false);
      final encoded =
          standardSerializers.serializeWith(
                MonthlyReputationReportResponsePreparation.serializer,
                value,
              )
              as Map;
      final report = encoded['report'] as Map;
      expect((report['quarterlySuggestion'] as Map)['points'], 150);
      expect((report['quarterlySuggestion'] as Map)['validFrom'], isNull);
      expect(
        (report['weekly'] as Map)['periodPolicyStatus'],
        'pending_owner_approval',
      );
    },
  );

  test(
    'partial week evidence stays null without inferred dates or identifiers',
    () {
      final value = standardSerializers.deserializeWith(
        MonthlyReputationReportResponsePreparation.serializer,
        fixture['partialReport'],
      )!;
      final weeks = value.report!.weekly!.selectedWeeks;
      expect(weeks[0].startsAt!.toUtc(), DateTime.utc(2026, 10, 26));
      expect(weeks[0].endsAt, isNull);
      expect(weeks[1].startsAt, isNull);
      expect(weeks[2].startsAt, isNull);
      expect(weeks[2].endsAt, isNull);
      final encoded =
          standardSerializers.serializeWith(
                MonthlyReputationReportResponsePreparation.serializer,
                value,
              )
              as Map;
      final report = encoded['report'] as Map;
      final rows = (report['weekly'] as Map)['selectedWeeks'] as List;
      expect(rows.every((row) => !(row as Map).containsKey('weekId')), isTrue);
      expect((rows[0] as Map).containsKey('endsAt'), isTrue);
      expect((rows[0] as Map)['endsAt'], isNull);
    },
  );

  test(
    'year boundary projection never becomes current monthly eligibility',
    () {
      final report = standardSerializers.deserializeWith(
        MonthlyReputationReportResponsePreparation.serializer,
        fixture['yearBoundaryReport'],
      )!;
      expect(report.sourceMonth, '2026-12');
      expect(report.effectiveMonth, '2027-01');
      final rewards = standardSerializers.deserializeWith(
        MonthlyRewardsResponsePreparation.serializer,
        fixture['rewards'],
      )!;
      expect(rewards.effectiveMonth, '2027-01');
      expect(rewards.snapshotProjection!.sourceScore, 13650);
      expect(rewards.currentLevel, isNull);
      expect(rewards.sourceScore, isNull);
      expect(rewards.sourceMonth, isNull);
    },
  );

  test(
    'generated clients retain own-member paths and bearer auth without selectors',
    () async {
      final adapter = MonthlyAdapter();
      final dio = Dio(BaseOptions(baseUrl: LythausApiClient.basePath));
      dio.httpClientAdapter = adapter;
      final client = LythausApiClient(dio: dio);
      client.setBearerAuth('bearerAuth', 'synthetic-jwt');
      final report = await client
          .getReputationApi()
          .getMyMonthlyReputationReport(sourceMonth: '2026-12');
      final rewards = await client.getRewardsApi().getMyMonthlyRewards();
      expect(report.data!.preparedResponse, isNull);
      expect(rewards.data!.preparedResponse, isNull);
      expect(report.data!.responsePreparation!.runtimeActivationAllowed, false);
      expect(adapter.requests.map((request) => request.path), [
        '/reputation/me/reports/monthly/2026-12',
        '/rewards/me/monthly',
      ]);
      for (final request in adapter.requests) {
        expect(request.method, 'GET');
        expect(request.headers['Authorization'], 'Bearer synthetic-jwt');
        expect(request.queryParameters, isEmpty);
        expect(request.data, isNull);
      }
      expect(rewards.headers.value('cache-control'), 'private, no-store');
    },
  );
}
