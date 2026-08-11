import 'dart:convert';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lythaus/core/network/dio_client.dart';
import 'package:lythaus/features/auth/application/auth_providers.dart';
import 'package:lythaus/state/models/reputation.dart';
import 'package:lythaus/state/providers/reputation_providers.dart';
import 'package:lythaus/ui/screens/profile/reputation_ledger_screen.dart';

class _ScenarioAdapter implements HttpClientAdapter {
  _ScenarioAdapter(this._handler);

  final ResponseBody Function(RequestOptions options) _handler;
  final List<RequestOptions> requests = <RequestOptions>[];

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<List<int>>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    requests.add(options);
    return _handler(options);
  }

  @override
  void close({bool force = false}) {}
}

Dio _dioWith(_ScenarioAdapter adapter) {
  final dio = Dio(BaseOptions(baseUrl: 'https://test.lythaus.co'));
  dio.httpClientAdapter = adapter;
  return dio;
}

ResponseBody _jsonResponse(Map<String, dynamic> payload) =>
    ResponseBody.fromString(
      jsonEncode(payload),
      200,
      headers: {
        Headers.contentTypeHeader: <String>[Headers.jsonContentType],
      },
    );

final _reputation = ReputationState.fromJson(<String, dynamic>{
  'userId': 'user-1',
  'level': 4,
  'reputationLevel': 4,
  'levelName': 'Credible contributor',
  'reputationStatus': 'active',
  'reputationBand': 'established',
  'policyVersion': 'reputation-v2',
  'pillars': <String, int>{
    'accountability': 81,
    'contribution': 82,
    'conduct': 87,
    'sourcing': 83,
    'authenticity': 84,
    'reviewReliability': 85,
  },
  'promotionBlockers': <String>['Complete an appeal review'],
  'evaluatedAt': '2026-08-11T09:00:00Z',
});

Widget _hostedScreen({Dio? dio, String? token = 'session-token'}) {
  return ProviderScope(
    overrides: [
      jwtProvider.overrideWith((ref) async => token),
      reputationProvider.overrideWith((ref) async => _reputation),
      if (dio != null) secureDioProvider.overrideWithValue(dio),
    ],
    child: const MaterialApp(home: ReputationLedgerScreen()),
  );
}

Map<String, dynamic> _activity({
  required String id,
  required String title,
  String category = 'account',
  String explanation = 'A private account event was recorded.',
  Map<String, dynamic> metadata = const <String, dynamic>{},
}) {
  return {
    'id': id,
    'category': category,
    'source': 'system',
    'title': title,
    'explanation': explanation,
    'result': 'succeeded',
    'reasonCode': 'recorded',
    'policyVersion': 'activity-v1.0.0',
    'objectType': category == 'moderation' ? 'moderation_case' : 'account',
    'objectId': category == 'moderation' ? 'case-1' : null,
    'reputationEffect': category == 'moderation' ? 'withheld' : 'none',
    'appealable': category == 'moderation',
    'retentionClass': category == 'moderation' ? 'moderation' : 'ordinary',
    'retentionDays': category == 'moderation' ? 90 : 730,
    'metadata': metadata,
    'createdAt': id == 'newest'
        ? '2026-08-11T10:00:00Z'
        : '2026-08-10T10:00:00Z',
  };
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  testWidgets('renders only server-issued reputation values', (tester) async {
    final adapter = _ScenarioAdapter(
      (_) => _jsonResponse({'items': <Map<String, dynamic>>[]}),
    );
    await tester.pumpWidget(_hostedScreen(dio: _dioWith(adapter)));
    await tester.pumpAndSettle();

    expect(find.text('Level 4: Credible contributor'), findsOneWidget);
    expect(find.text('established'), findsOneWidget);
    expect(find.text('active'), findsOneWidget);
    expect(find.text('87'), findsOneWidget);
    expect(find.text('reputation-v2'), findsOneWidget);
    expect(find.textContaining('2026-08-11'), findsOneWidget);
    await tester.fling(find.byType(ListView).first, const Offset(0, -420), 900);
    await tester.pumpAndSettle();
    expect(find.text('Complete an appeal review'), findsOneWidget);
  });

  testWidgets('filters activity, resets the cursor, and appends older pages', (
    tester,
  ) async {
    final adapter = _ScenarioAdapter((options) {
      final query = options.uri.queryParameters;
      if (query['category'] == 'content') {
        return _jsonResponse({
          'items': [_activity(id: 'content', title: 'Content record')],
        });
      }
      if (query['cursor'] == 'older-page') {
        return _jsonResponse({
          'items': [_activity(id: 'older', title: 'Older record')],
        });
      }
      return _jsonResponse({
        'items': [_activity(id: 'newest', title: 'Newest record')],
        'nextCursor': 'older-page',
      });
    });
    await tester.pumpWidget(_hostedScreen(dio: _dioWith(adapter)));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Account activity'));
    await tester.pumpAndSettle();

    expect(find.text('Newest record'), findsOneWidget);
    await tester.tap(find.text('Load older activity'));
    await tester.pumpAndSettle();

    expect(find.text('Older record'), findsOneWidget);
    expect(
      tester.getTopLeft(find.text('Newest record')).dy,
      lessThan(tester.getTopLeft(find.text('Older record')).dy),
    );

    await tester.tap(find.text('Content'));
    await tester.pumpAndSettle();

    expect(find.text('Content record'), findsOneWidget);
    expect(find.text('Newest record'), findsNothing);
    expect(find.text('Older record'), findsNothing);
    final request = adapter.requests.last;
    expect(request.uri.queryParameters['category'], 'content');
    expect(request.uri.queryParameters.containsKey('cursor'), isFalse);
  });

  testWidgets(
    'shows safe detail fields and an applicable Lythaus policy link',
    (tester) async {
      const launcherChannel = MethodChannel('plugins.flutter.io/url_launcher');
      final launcherCalls = <MethodCall>[];
      TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
          .setMockMethodCallHandler(launcherChannel, (call) async {
            launcherCalls.add(call);
            return true;
          });
      addTearDown(() {
        TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
            .setMockMethodCallHandler(launcherChannel, null);
      });

      final adapter = _ScenarioAdapter(
        (_) => _jsonResponse({
          'items': [
            _activity(
              id: 'moderation',
              title: 'Moderation completed',
              category: 'moderation',
              explanation: 'A review reached an eligible outcome.',
              metadata: <String, dynamic>{'accessToken': 'api-token-secret'},
            ),
          ],
        }),
      );
      await tester.pumpWidget(_hostedScreen(dio: _dioWith(adapter)));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Account activity'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Moderation completed'));
      await tester.pumpAndSettle();

      expect(find.text('Timestamp'), findsOneWidget);
      expect(find.text('Category'), findsOneWidget);
      expect(find.text('Source'), findsOneWidget);
      expect(find.text('Explanation'), findsOneWidget);
      expect(find.text('Result'), findsOneWidget);
      expect(find.text('Object'), findsOneWidget);
      await tester.scrollUntilVisible(
        find.text('Reputation effect'),
        140,
        scrollable: find.byType(Scrollable).last,
      );
      expect(find.text('Reputation effect'), findsOneWidget);
      expect(find.text('Appealability'), findsOneWidget);
      await tester.scrollUntilVisible(
        find.text('Retention'),
        140,
        scrollable: find.byType(Scrollable).last,
      );
      expect(find.text('Retention'), findsOneWidget);
      expect(find.text('Policy version'), findsOneWidget);
      expect(find.text('api-token-secret'), findsNothing);
      await tester.scrollUntilVisible(
        find.bySemanticsLabel('Open Lythaus Community Guidelines'),
        140,
        scrollable: find.byType(Scrollable).last,
      );
      expect(
        find.bySemanticsLabel('Open Lythaus Community Guidelines'),
        findsOneWidget,
      );

      await tester.tap(find.text('Lythaus Community Guidelines'));
      await tester.pumpAndSettle();
      expect(launcherCalls, isNotEmpty);
    },
  );

  testWidgets('shows an accessible activity retry state without a session', (
    tester,
  ) async {
    await tester.pumpWidget(_hostedScreen(token: null));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Account activity'));
    await tester.pumpAndSettle();

    expect(find.text('Could not load account activity.'), findsOneWidget);
    expect(find.text('Retry'), findsOneWidget);
  });
}
