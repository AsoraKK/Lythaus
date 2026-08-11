import 'dart:convert';

import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lythaus/core/network/dio_client.dart';
import 'package:lythaus/features/auth/application/auth_providers.dart';
import 'package:lythaus/state/models/reputation.dart';
import 'package:lythaus/state/providers/reputation_providers.dart';

class _CapturingAdapter implements HttpClientAdapter {
  _CapturingAdapter(this._handler);

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

Dio _dioWith(_CapturingAdapter adapter) {
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

void main() {
  test('private reputation state fails clearly without a session', () async {
    final container = ProviderContainer(
      overrides: [jwtProvider.overrideWith((ref) async => null)],
    );
    addTearDown(container.dispose);

    await expectLater(
      container.read(reputationProvider.future),
      throwsA(isA<StateError>()),
    );
  });

  test('private activity pages fail clearly without a session', () async {
    final container = ProviderContainer(
      overrides: [jwtProvider.overrideWith((ref) async => null)],
    );
    addTearDown(container.dispose);

    await expectLater(
      container.read(activityPageProvider(null).future),
      throwsA(isA<StateError>()),
    );
  });

  test('private activity sends the selected category and cursor', () async {
    final adapter = _CapturingAdapter(
      (_) => _jsonResponse({
        'items': [
          {
            'id': 'activity-1',
            'category': 'moderation',
            'source': 'system',
            'title': 'Moderation case resolved',
            'explanation': 'A decision is available.',
            'result': 'succeeded',
            'reasonCode': 'decision_resolved',
            'policyVersion': 'activity-v1.0.0',
            'objectType': 'moderation_case',
            'reputationEffect': 'withheld',
            'appealable': true,
            'retentionClass': 'moderation',
            'retentionDays': 90,
            'createdAt': '2026-08-11T10:00:00Z',
          },
        ],
        'nextCursor': 'next-page',
      }),
    );
    final container = ProviderContainer(
      overrides: [
        jwtProvider.overrideWith((ref) async => 'session-token'),
        secureDioProvider.overrideWithValue(_dioWith(adapter)),
      ],
    );
    addTearDown(container.dispose);

    final page = await container.read(
      activityPageProvider(
        const ActivityPageQuery(
          cursor: 'prior-page',
          category: ActivityCategory.moderation,
        ),
      ).future,
    );

    expect(page.items.single.title, 'Moderation case resolved');
    expect(page.nextCursor, 'next-page');
    final request = adapter.requests.single;
    expect(request.path, '/api/activity');
    expect(request.uri.queryParameters['category'], 'moderation');
    expect(request.uri.queryParameters['cursor'], 'prior-page');
    expect(request.uri.queryParameters['limit'], '20');
    expect(request.headers['Authorization'], 'Bearer session-token');
  });

  test(
    'the legacy unfiltered activity query omits the category parameter',
    () async {
      final adapter = _CapturingAdapter(
        (_) => _jsonResponse({'items': <Map<String, dynamic>>[]}),
      );
      final container = ProviderContainer(
        overrides: [
          jwtProvider.overrideWith((ref) async => 'session-token'),
          secureDioProvider.overrideWithValue(_dioWith(adapter)),
        ],
      );
      addTearDown(container.dispose);

      await container.read(activityPageProvider(null).future);

      expect(
        adapter.requests.single.uri.queryParameters.containsKey('category'),
        isFalse,
      );
    },
  );
}
