import 'dart:convert';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:lythaus/core/network/dio_client.dart';
import 'package:lythaus/ui/components/receipt_drawer.dart';

class _MockAdapter implements HttpClientAdapter {
  _MockAdapter(this._fetcher);

  final Future<ResponseBody> Function(RequestOptions options) _fetcher;

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<List<int>>? requestStream,
    Future<void>? cancelFuture,
  ) {
    return _fetcher(options);
  }

  @override
  void close({bool force = false}) {}
}

Dio _dioWithAdapter(HttpClientAdapter adapter) {
  final dio = Dio(BaseOptions(baseUrl: 'http://test'));
  dio.httpClientAdapter = adapter;
  return dio;
}

ResponseBody _jsonResponse(Map<String, dynamic> data) {
  return ResponseBody.fromString(
    jsonEncode(data),
    200,
    headers: {
      Headers.contentTypeHeader: ['application/json'],
    },
  );
}

Widget _hostedSheet({required Dio dio, required String postId}) {
  return ProviderScope(
    overrides: [secureDioProvider.overrideWithValue(dio)],
    child: MaterialApp(
      home: Scaffold(body: ReceiptDrawerSheet(postId: postId)),
    ),
  );
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  const launcherChannel = MethodChannel('plugins.flutter.io/url_launcher');
  final launcherCalls = <MethodCall>[];

  setUp(() {
    launcherCalls.clear();
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(launcherChannel, (call) async {
          launcherCalls.add(call);
          if (call.method == 'canLaunch' || call.method == 'canLaunchUrl') {
            return true;
          }
          if (call.method == 'launch' || call.method == 'launchUrl') {
            return true;
          }
          return true;
        });
  });

  tearDown(() {
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(launcherChannel, null);
  });

  testWidgets('shows loading then empty state', (tester) async {
    final dio = _dioWithAdapter(
      _MockAdapter((_) async {
        await Future<void>.delayed(const Duration(milliseconds: 20));
        return _jsonResponse({
          'postId': 'post-empty',
          'events': <Map<String, dynamic>>[],
          'issuedAt': '2026-01-01T00:00:00Z',
          'signature': 'sig',
          'keyId': 'k1',
        });
      }),
    );

    await tester.pumpWidget(_hostedSheet(dio: dio, postId: 'post-empty'));
    expect(find.byType(CircularProgressIndicator), findsOneWidget);

    await tester.pumpAndSettle();
    expect(find.text('No receipt events yet.'), findsOneWidget);
  });

  testWidgets('renders events, learn more and copy event id', (tester) async {
    final dio = _dioWithAdapter(
      _MockAdapter((_) async {
        return _jsonResponse({
          'postId': 'post-1',
          'events': [
            {
              'id': 'evt-1',
              'type': 'MODERATION_DECIDED',
              'summary': 'Moderation decision recorded',
              'reason': 'The post was reviewed against policy.',
              'policyLinks': [
                {'title': 'Policy', 'url': 'not a valid uri'},
              ],
              'actions': [
                {'key': 'LEARN_MORE', 'label': 'Learn more', 'enabled': true},
              ],
            },
          ],
          'issuedAt': '2026-01-01T00:00:00Z',
          'signature': 'sig',
          'keyId': 'k1',
        });
      }),
    );

    await tester.pumpWidget(_hostedSheet(dio: dio, postId: 'post-1'));
    await tester.pumpAndSettle();

    expect(find.text('Post Receipt'), findsOneWidget);
    expect(find.text('Moderation decision recorded'), findsOneWidget);
    expect(find.text('The post was reviewed against policy.'), findsOneWidget);
    expect(find.text('Learn more'), findsOneWidget);
    expect(find.text('Policy'), findsOneWidget);
    expect(find.textContaining('Event ID: evt-1'), findsOneWidget);

    await tester.tap(find.byTooltip('Copy event ID'));
    await tester.pump();
  });

  testWidgets('hides appeal button once any appeal event exists', (
    tester,
  ) async {
    final dio = _dioWithAdapter(
      _MockAdapter((_) async {
        return _jsonResponse({
          'postId': 'post-2',
          'events': [
            {
              'id': 'evt-appeal-opened',
              'type': 'APPEAL_OPENED',
              'summary': 'Appeal opened',
              'reason': 'An appeal was submitted.',
              'policyLinks': <Map<String, dynamic>>[],
              'actions': <Map<String, dynamic>>[],
            },
            {
              'id': 'evt-mod',
              'type': 'MODERATION_DECIDED',
              'summary': 'Actioned',
              'reason': 'Moderator action recorded.',
              'policyLinks': <Map<String, dynamic>>[],
              'actions': [
                {'key': 'APPEAL', 'label': 'Appeal', 'enabled': true},
              ],
            },
          ],
          'issuedAt': '2026-01-01T00:00:00Z',
          'signature': 'sig',
          'keyId': 'k1',
        });
      }),
    );

    await tester.pumpWidget(_hostedSheet(dio: dio, postId: 'post-2'));
    await tester.pumpAndSettle();

    expect(find.text('Appeal'), findsNothing);
    expect(find.text('Appeal opened'), findsOneWidget);
  });

  testWidgets('shows retry after error and reloads successfully', (
    tester,
  ) async {
    var callCount = 0;
    final dio = _dioWithAdapter(
      _MockAdapter((options) async {
        callCount += 1;
        if (callCount == 1) {
          throw DioException(
            requestOptions: options,
            type: DioExceptionType.badResponse,
            response: Response(requestOptions: options, statusCode: 500),
          );
        }
        return _jsonResponse({
          'postId': 'post-3',
          'events': [
            {
              'id': 'evt-2',
              'type': 'RECEIPT_CREATED',
              'summary': 'Created',
              'reason': 'Post was created.',
              'policyLinks': <Map<String, dynamic>>[],
              'actions': <Map<String, dynamic>>[],
            },
          ],
          'issuedAt': '2026-01-01T00:00:00Z',
          'signature': 'sig',
          'keyId': 'k1',
        });
      }),
    );

    await tester.pumpWidget(_hostedSheet(dio: dio, postId: 'post-3'));
    await tester.pumpAndSettle();

    expect(find.text('Receipt unavailable'), findsOneWidget);
    expect(find.text('Retry'), findsOneWidget);

    await tester.tap(find.text('Retry'));
    await tester.pumpAndSettle();

    expect(find.text('Created'), findsOneWidget);
    expect(callCount, 2);
  });

  testWidgets('show helper opens modal sheet', (tester) async {
    final dio = _dioWithAdapter(
      _MockAdapter((_) async {
        return _jsonResponse({
          'postId': 'post-4',
          'events': <Map<String, dynamic>>[],
          'issuedAt': '2026-01-01T00:00:00Z',
          'signature': 'sig',
          'keyId': 'k1',
        });
      }),
    );

    await tester.pumpWidget(
      ProviderScope(
        overrides: [secureDioProvider.overrideWithValue(dio)],
        child: MaterialApp(
          home: Scaffold(
            body: Builder(
              builder: (context) => TextButton(
                onPressed: () => ReceiptDrawer.show(context, 'post-4'),
                child: const Text('Open receipt'),
              ),
            ),
          ),
        ),
      ),
    );

    await tester.tap(find.text('Open receipt'));
    await tester.pumpAndSettle();
    expect(find.text('Post Receipt'), findsOneWidget);
  });

  testWidgets('uses fallback labels for sparse event payload and closes', (
    tester,
  ) async {
    final dio = _dioWithAdapter(
      _MockAdapter((_) async {
        return _jsonResponse({
          'postId': 'post-5',
          'events': [
            {
              'id': 'evt-5',
              'policyLinks': [
                {'url': ''},
              ],
              'actions': [
                {'enabled': true},
              ],
            },
          ],
          'issuedAt': '2026-01-01T00:00:00Z',
          'signature': 'sig',
          'keyId': 'k1',
        });
      }),
    );

    await tester.pumpWidget(
      ProviderScope(
        overrides: [secureDioProvider.overrideWithValue(dio)],
        child: MaterialApp(
          home: Scaffold(
            body: Builder(
              builder: (context) => TextButton(
                onPressed: () => ReceiptDrawer.show(context, 'post-5'),
                child: const Text('Open sparse receipt'),
              ),
            ),
          ),
        ),
      ),
    );

    await tester.tap(find.text('Open sparse receipt'));
    await tester.pumpAndSettle();

    expect(find.text('Event recorded'), findsOneWidget);
    expect(
      find.text('This action was recorded for transparency.'),
      findsOneWidget,
    );
    expect(find.text('Policy'), findsOneWidget);
    expect(find.text('Learn more'), findsOneWidget);

    await tester.tap(find.byIcon(Icons.close));
    await tester.pumpAndSettle();
    expect(find.text('Post Receipt'), findsNothing);
  });

  testWidgets('learn more launches policy link when available', (tester) async {
    final dio = _dioWithAdapter(
      _MockAdapter((_) async {
        return _jsonResponse({
          'postId': 'post-launch',
          'events': [
            {
              'id': 'evt-launch',
              'type': 'RECEIPT_CREATED',
              'summary': 'Created',
              'reason': 'Recorded',
              'policyLinks': [
                {'title': 'Policy', 'url': 'https://example.com/policy'},
              ],
              'actions': [
                {'key': 'LEARN_MORE', 'label': 'Learn more', 'enabled': true},
              ],
            },
          ],
          'issuedAt': '2026-01-01T00:00:00Z',
          'signature': 'sig',
          'keyId': 'k1',
        });
      }),
    );

    await tester.pumpWidget(_hostedSheet(dio: dio, postId: 'post-launch'));
    await tester.pumpAndSettle();

    await tester.tap(find.text('Learn more'));
    await tester.pumpAndSettle();

    expect(
      launcherCalls.where((call) => call.method.contains('launch')).isNotEmpty,
      isTrue,
    );
  });
}
