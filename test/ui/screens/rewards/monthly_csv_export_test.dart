import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lythaus/core/network/dio_client.dart';
import 'package:lythaus/features/auth/application/auth_providers.dart';
import 'package:lythaus/features/rewards/application/reward_providers.dart';
import 'package:lythaus/ui/screens/rewards/monthly_reputation_widgets.dart';
import '../../../support/monthly_rewards_fixture.dart';

class _CsvAdapter implements HttpClientAdapter {
  final requests = <RequestOptions>[];
  final responses = <Completer<ResponseBody>>[];
  final cancelled = <bool>[];
  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<List<int>>? requestStream,
    Future<void>? cancelFuture,
  ) {
    final index = requests.length;
    requests.add(options);
    cancelled.add(false);
    cancelFuture?.then((_) => cancelled[index] = true);
    final response = Completer<ResponseBody>();
    responses.add(response);
    return response.future;
  }

  @override
  void close({bool force = false}) {}
}

const _saveChannel = MethodChannel('plugins.flutter.io/file_selector');
ResponseBody _csv(String body, {int status = 200}) =>
    ResponseBody.fromBytes(utf8.encode(body), status);

Future<ProviderContainer> _mount(
  WidgetTester tester,
  _CsvAdapter adapter,
) async {
  final dio = Dio(BaseOptions(baseUrl: 'http://synthetic.invalid'))
    ..httpClientAdapter = adapter;
  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        ...monthlyFixtureOverrides(),
        jwtProvider.overrideWith(
          (ref) async => 'synthetic-${ref.watch(currentUserProvider)?.id}',
        ),
        secureDioProvider.overrideWithValue(dio),
        monthlyReputationReportProvider.overrideWith(
          (ref, month) async => monthlyReport(
            month,
            detail: {
              'total': {'sourceScore': 0, 'maximumSourceMonth': 13500},
            },
          ),
        ),
      ],
      child: MaterialApp(
        home: Scaffold(
          body: ListView(children: const [MonthlyReputationReportCard()]),
        ),
      ),
    ),
  );
  await tester.pumpAndSettle();
  return ProviderScope.containerOf(
    tester.element(find.byType(MonthlyReputationReportCard)),
  );
}

Future<void> _export(WidgetTester tester) async {
  final button = find.widgetWithText(OutlinedButton, 'Export CSV');
  await tester.ensureVisible(button);
  await tester.pumpAndSettle();
  await tester.tap(button);
  for (var frame = 0; frame < 4; frame++) {
    await tester.pump(const Duration(milliseconds: 50));
  }
}

void main() {
  tearDown(() {
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(_saveChannel, null);
  });

  _testExport(
    'CSV button retains delayed request and saves exact server bytes',
    (tester) async {
      final directory = Directory.systemTemp.createTempSync(
        'monthly-csv-test-',
      );
      addTearDown(() => directory.deleteSync(recursive: true));
      final destination = File('${directory.path}/report.csv');
      var dialogs = 0;
      TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
          .setMockMethodCallHandler(_saveChannel, (call) async {
            expect(call.method, 'getSavePath');
            expect(
              call.arguments['suggestedName'],
              'monthly-reputation-${monthlyTestMonth()}.csv',
            );
            dialogs++;
            return destination.path;
          });
      final adapter = _CsvAdapter();
      await _mount(tester, adapter);
      await _export(tester);
      expect(adapter.requests, hasLength(1));
      expect(adapter.cancelled, [false]);
      expect(dialogs, 0);
      expect(
        adapter.requests.single.path,
        '/reputation/me/reports/monthly/${monthlyTestMonth()}/export.csv',
      );
      expect(
        adapter.requests.single.headers['Authorization'],
        'Bearer synthetic-owner-a',
      );
      adapter.responses.single.complete(_csv('sourceMonth,score\n2026-10,0\n'));
      for (var frame = 0; frame < 40; frame++) {
        await tester.pump(const Duration(milliseconds: 10));
        await tester.runAsync(
          () => Future<void>.delayed(const Duration(milliseconds: 10)),
        );
        if (tester
                .widget<OutlinedButton>(find.byType(OutlinedButton))
                .onPressed !=
            null) {
          break;
        }
      }
      await tester.pumpAndSettle();
      expect(dialogs, 1);
      expect(destination.readAsStringSync(), 'sourceMonth,score\n2026-10,0\n');
      expect(adapter.cancelled, [true]);
    },
  );

  _testExport('CSV error exposes retry and retry opens a fresh request', (
    tester,
  ) async {
    var dialogs = 0;
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(_saveChannel, (_) async {
          dialogs++;
          return null;
        });
    final adapter = _CsvAdapter();
    await _mount(tester, adapter);
    await _export(tester);
    adapter.responses.first.complete(_csv('private failure', status: 503));
    await tester.pumpAndSettle();
    expect(find.textContaining('could not be exported'), findsOneWidget);
    expect(find.textContaining('private failure'), findsNothing);
    await tester.pump(const Duration(seconds: 5));
    await tester.pumpAndSettle();
    await _export(tester);
    expect(adapter.requests, hasLength(2));
    expect(adapter.cancelled[1], false);
    adapter.responses[1].complete(_csv('fresh report'));
    await tester.pumpAndSettle();
    expect(dialogs, 1);
    expect(adapter.cancelled, [true, true]);
  });

  for (final change in ['navigation', 'sign-out', 'account-switch']) {
    _testExport('CSV $change cancels pending bytes without a save or error', (
      tester,
    ) async {
      var dialogs = 0;
      TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
          .setMockMethodCallHandler(_saveChannel, (_) async {
            dialogs++;
            return null;
          });
      final adapter = _CsvAdapter();
      final container = await _mount(tester, adapter);
      await _export(tester);
      expect(adapter.cancelled, [false]);
      if (change == 'navigation') {
        await tester.pumpWidget(const MaterialApp(home: Scaffold()));
      } else {
        container.read(monthlyTestSession.notifier).state = change == 'sign-out'
            ? null
            : monthlyTestUser('owner-b');
      }
      await tester.pumpAndSettle();
      expect(adapter.cancelled, [true]);
      adapter.responses.first.complete(_csv('owner-a private report'));
      await tester.pumpAndSettle();
      expect(dialogs, 0);
      expect(find.textContaining('could not be exported'), findsNothing);
      if (change == 'account-switch') {
        await _export(tester);
        expect(
          adapter.requests[1].headers['Authorization'],
          'Bearer synthetic-owner-b',
        );
        adapter.responses[1].complete(_csv('owner-b report'));
        await tester.pumpAndSettle();
        expect(dialogs, 1);
      }
    });
  }

  _testExport('sign-out while save dialog is open writes no private CSV', (
    tester,
  ) async {
    final directory = Directory.systemTemp.createTempSync('monthly-csv-test-');
    addTearDown(() => directory.deleteSync(recursive: true));
    final destination = File('${directory.path}/stale.csv');
    final dialog = Completer<String?>();
    var opened = false;
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(_saveChannel, (_) {
          opened = true;
          return dialog.future;
        });
    final adapter = _CsvAdapter();
    final container = await _mount(tester, adapter);
    await _export(tester);
    adapter.responses.first.complete(_csv('owner-a private report'));
    for (var frame = 0; frame < 20 && !opened; frame++) {
      await tester.pump(const Duration(milliseconds: 10));
    }
    expect(opened, true);
    container.read(monthlyTestSession.notifier).state = null;
    await tester.pump();
    dialog.complete(destination.path);
    await tester.pumpAndSettle();
    expect(destination.existsSync(), false);
    expect(find.textContaining('Sign in'), findsOneWidget);
  });
}

void _testExport(String description, WidgetTesterCallback callback) =>
    testWidgets(
      description,
      callback,
      variant: const TargetPlatformVariant({TargetPlatform.linux}),
    );
