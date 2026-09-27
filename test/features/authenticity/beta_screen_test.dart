import 'package:dio/dio.dart';
import 'dart:async';
import 'dart:typed_data';
import 'package:file_selector/file_selector.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lythaus/features/authenticity/beta_api.dart';
import 'package:lythaus/features/authenticity/beta_screen.dart';

class _Api extends BetaApi {
  _Api() : super(Dio(), () async => 'test');
  final calls = <String>[];
  String status = 'complete';
  bool empty = false,
      unavailable = false,
      failAction = false,
      failDetail = false;
  Uint8List? uploaded;
  Completer<String>? pendingUpload;
  @override
  Future<String> upload(
    Uint8List bytes,
    String mime,
    void Function(int, int) progress,
  ) async {
    uploaded = bytes;
    calls.add('UPLOAD $mime');
    progress(bytes.length, bytes.length);
    if (pendingUpload != null) await pendingUpload!.future;
    empty = false;
    status = 'queued';
    return 'fixture-case';
  }

  @override
  Future<Uint8List?> image(String caseId) async => null;
  Map<String, dynamic> get item => {
    'caseId': 'fixture-case',
    'status': status,
    'createdAt': '2026-09-27',
    'reviewState': 'none',
    'finding': 'NO_POSITIVE_SAFE_EVIDENCE',
    'explanation':
        'No positive SAFE evidence was detected. This does not establish human authorship.',
    'advisoryStatus': 'not_requested',
    'limitations': ['Private experimental analysis.'],
    'versions': {'analysis': betaConsentVersion},
    'reviews': <Map<String, dynamic>>[],
  };
  @override
  Future<Map<String, dynamic>> request(
    String suffix, {
    String method = 'GET',
    Map<String, dynamic>? data,
  }) async {
    calls.add('$method $suffix');
    if (unavailable ||
        (failAction && method != 'GET') ||
        (failDetail && suffix.isNotEmpty)) {
      throw StateError('protocol fixture offline');
    }
    if (method == 'DELETE') empty = true;
    if (suffix.endsWith('/cancel')) status = 'cancelled';
    if (suffix.endsWith('/finalise')) status = 'queued';
    return suffix.isEmpty
        ? {
            'items': empty ? <Map<String, dynamic>>[] : [item],
          }
        : item;
  }
}

Future<void> _openScreen(
  WidgetTester tester,
  _Api api, {
  Future<XFile?> Function()? picker,
}) async {
  tester.view.physicalSize = const Size(1280, 1800);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        betaApiProvider.overrideWithValue(api),
        if (picker != null) betaImagePickerProvider.overrideWithValue(picker),
      ],
      child: const MaterialApp(home: AuthenticityBetaScreen()),
    ),
  );
  await tester.pumpAndSettle();
}

Future<void> _tapVisible(WidgetTester tester, String text) async {
  await tester.ensureVisible(find.text(text));
  await tester.tap(find.text(text));
  await tester.pumpAndSettle();
}

void main() {
  testWidgets(
    'consent gates byte-preserving upload and exposes progress before returning to queued case',
    (tester) async {
      final api = _Api()
        ..empty = true
        ..pendingUpload = Completer<String>();
      final bytes = Uint8List.fromList([137, 80, 78, 71, 13, 10, 26, 10, 42]);
      var selections = 0;
      await _openScreen(
        tester,
        api,
        picker: () async {
          selections++;
          return XFile.fromData(bytes, name: 'authorized.png');
        },
      );
      expect(
        tester
            .widget<FilledButton>(
              find.widgetWithText(FilledButton, 'Select and upload image'),
            )
            .onPressed,
        isNull,
      );
      expect(selections, 0);
      await tester.tap(find.byType(CheckboxListTile));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Select and upload image'));
      await tester.pump();
      await tester.pump();
      expect(find.byType(LinearProgressIndicator), findsOneWidget);
      expect(api.uploaded, bytes);
      api.pendingUpload!.complete('fixture-case');
      await tester.pumpAndSettle();
      expect(find.text('queued'), findsOneWidget);
      expect(find.byType(LinearProgressIndicator), findsNothing);
      expect(api.calls.where((call) => call.startsWith('UPLOAD')).length, 1);
      await tester.pumpWidget(const SizedBox());
    },
  );
  testWidgets('cancelled picker and unsupported bytes never submit a case', (
    tester,
  ) async {
    final api = _Api()..empty = true;
    XFile? selection;
    await _openScreen(tester, api, picker: () async => selection);
    await tester.tap(find.byType(CheckboxListTile));
    await tester.pumpAndSettle();
    await _tapVisible(tester, 'Select and upload image');
    expect(api.uploaded, isNull);
    selection = XFile.fromData(
      Uint8List.fromList([1, 2, 3]),
      name: 'forged.png',
    );
    await _tapVisible(tester, 'Select and upload image');
    expect(find.textContaining('Upload could not finish.'), findsOneWidget);
    expect(api.calls.where((call) => call.startsWith('UPLOAD')), isEmpty);
  });
  testWidgets(
    'reconnect and foreground polling retrieve persisted cases without new inference',
    (tester) async {
      final api = _Api()..status = 'analyzing';
      await _openScreen(tester, api);
      await _tapVisible(tester, 'analyzing');
      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.paused);
      final pausedCalls = api.calls.length;
      await tester.pump(const Duration(seconds: 30));
      expect(api.calls.length, pausedCalls);
      api.status = 'complete';
      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.hidden);
      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.inactive);
      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
      await tester.pumpAndSettle();
      expect(find.text('complete'), findsOneWidget);
      expect(api.calls.every((call) => call.startsWith('GET')), true);
      await tester.pumpWidget(const SizedBox());
      await _openScreen(tester, api);
      expect(find.text('complete'), findsOneWidget);
    },
  );
  testWidgets(
    'failed list/detail/action recover without creating an analysis',
    (tester) async {
      final api = _Api()..unavailable = true;
      await _openScreen(tester, api);
      expect(
        find.textContaining('private beta is unavailable'),
        findsOneWidget,
      );
      api.unavailable = false;
      await tester.tap(find.byTooltip('Refresh cases'));
      await tester.pumpAndSettle();
      api.failDetail = true;
      await _tapVisible(tester, 'complete');
      expect(find.textContaining('case could not be opened'), findsOneWidget);
      api.failDetail = false;
      await _tapVisible(tester, 'complete');
      api.failAction = true;
      await _tapVisible(tester, 'Send feedback');
      expect(find.textContaining('action could not finish'), findsOneWidget);
      api.failAction = false;
      await tester.enterText(
        find.byType(TextField),
        'My processing history is unknown.',
      );
      await _tapVisible(tester, 'Send feedback');
      expect(
        tester.widget<TextField>(find.byType(TextField)).controller!.text,
        isEmpty,
      );
      expect(
        api.calls.where((call) => call == 'POST /fixture-case/feedback').length,
        2,
      );
    },
  );
  testWidgets(
    'unfinished uploads can finalise, cancel and delete their persisted case',
    (tester) async {
      final api = _Api()..status = 'uploading';
      await _openScreen(tester, api);
      await _tapVisible(tester, 'uploading');
      await _tapVisible(tester, 'Finish uploaded case');
      expect(api.calls, contains('POST /fixture-case/finalise'));
      await _tapVisible(tester, 'Cancel analysis');
      expect(find.text('cancelled'), findsOneWidget);
      await _tapVisible(tester, 'Delete case');
      expect(find.text('No private cases yet.'), findsOneWidget);
      expect(api.calls, contains('DELETE /fixture-case'));
    },
  );
  testWidgets('reward preview is local and resets without service mutations', (
    tester,
  ) async {
    final api = _Api()..empty = true;
    await _openScreen(tester, api);
    await _tapVisible(tester, 'Rewards and reputation sandbox');
    final before = List<String>.of(api.calls);
    await _tapVisible(tester, 'Simulate reward');
    expect(find.textContaining('Simulated balance: 5.'), findsOneWidget);
    await _tapVisible(tester, 'Reset preview');
    expect(find.textContaining('Simulated balance: 0.'), findsOneWidget);
    expect(api.calls, before);
  });
  for (final size in [const Size(390, 844), const Size(1280, 900)]) {
    testWidgets('private results and feedback remain usable at $size', (
      tester,
    ) async {
      tester.view.physicalSize = size;
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      final api = _Api();
      await tester.pumpWidget(
        ProviderScope(
          overrides: [betaApiProvider.overrideWithValue(api)],
          child: const MaterialApp(home: AuthenticityBetaScreen()),
        ),
      );
      await tester.pumpAndSettle();
      final tile = find.text('complete');
      await tester.scrollUntilVisible(
        tile,
        300,
        scrollable: find.byType(Scrollable).first,
      );
      await tester.tap(tile);
      await tester.pumpAndSettle();
      expect(
        find.textContaining('does not establish human authorship'),
        findsOneWidget,
      );
      await tester.scrollUntilVisible(
        find.byType(TextField),
        300,
        scrollable: find.byType(Scrollable).first,
      );
      await tester.enterText(
        find.byType(TextField),
        'Please review the evidence.',
      );
      await tester.scrollUntilVisible(
        find.text('Request review'),
        200,
        scrollable: find.byType(Scrollable).first,
      );
      await tester.tap(find.text('Request review'));
      await tester.pumpAndSettle();
      expect(api.calls, contains('POST /fixture-case/review'));
      expect(api.calls.where((call) => call.startsWith('POST')).length, 1);
      expect(tester.takeException(), isNull);
    });
  }
}
