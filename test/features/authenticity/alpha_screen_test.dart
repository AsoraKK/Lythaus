import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:file_selector/file_selector.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lythaus/features/authenticity/alpha_api.dart';
import 'package:lythaus/features/authenticity/alpha_screen.dart';

class _Api extends PrivateAlphaApi {
  _Api() : super(Dio(), () async => 'test-token');

  final calls = <String>[];
  bool empty = false;
  bool fail = false;
  String status = 'complete';
  String adviserStatus = 'not_requested';
  String contentKind = 'image';
  bool hasImage = true;
  final imageBytes = Uint8List.fromList(base64Decode(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  ));

  Map<String, dynamic> get item => {
        'caseId': 'alpha-case',
        'contentKind': contentKind,
        'status': status,
        'finding': 'INCONCLUSIVE',
        'interpretation': 'inconclusive',
        'explanation': 'Processing completed; authorship remains unavailable.',
        'adviserStatus': adviserStatus,
        'reviewState': 'none',
        'hasImage': hasImage,
        'observer': {
          'observations': [
            {
              'category': 'scene',
              'status': 'available',
              'observation': 'A bounded visual observation.',
            },
          ],
        },
        'execution': {
          'safety_image': {
            'execution': 'completed',
            'interpretation': 'available',
            'reason': null,
          },
          'safe': {
            'execution': 'completed',
            'interpretation': 'inconclusive',
            'reason': 'history_unknown',
          },
          'observer': {
            'execution': 'completed',
            'interpretation': 'available',
            'reason': null,
          },
          'adviser': {
            'execution': adviserStatus == 'not_requested' ? 'skipped' : 'completed',
            'interpretation': adviserStatus == 'complete' ? 'available' : 'not_requested',
            'reason': adviserStatus == 'not_requested' ? 'explanation_not_requested' : null,
          },
        },
        'limitations': [
          'This private alpha does not establish human authorship.',
          'JPEG and unknown processing history may make SAFE interpretation inconclusive.',
        ],
      };

  @override
  Future<Map<String, dynamic>> request(
    String suffix, {
    String method = 'GET',
    Map<String, dynamic>? data,
  }) async {
    calls.add('$method $suffix');
    if (fail) throw StateError('fixture unavailable');
    if (method == 'DELETE') {
      empty = true;
    } else if (suffix.endsWith('/advice')) {
      adviserStatus = 'complete';
    }
    if (suffix.isEmpty) {
      return {'items': empty ? <Map<String, dynamic>>[] : [item]};
    }
    return item;
  }

  @override
  Future<String> submitText({
    required String text,
    required bool observerRequested,
    required bool explanationRequested,
  }) async {
    calls.add('POST text');
    empty = false;
    status = 'queued';
    contentKind = 'text';
    hasImage = false;
    return 'alpha-case';
  }

  @override
  Future<String> uploadImage({
    required Uint8List bytes,
    required String mime,
    required String? text,
    required bool observerRequested,
    required bool explanationRequested,
    required void Function(int, int) progress,
  }) async {
    calls.add('UPLOAD $mime');
    progress(bytes.length, bytes.length);
    empty = false;
    status = 'queued';
    contentKind = 'image';
    hasImage = true;
    return 'alpha-case';
  }

  @override
  Future<Uint8List?> image(String caseId) async {
    calls.add('GET image');
    return imageBytes;
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
        privateAlphaApiProvider.overrideWithValue(api),
        if (picker != null) privateAlphaImagePickerProvider.overrideWithValue(picker),
      ],
      child: const MaterialApp(home: AuthenticityPrivateAlphaScreen()),
    ),
  );
  await tester.pumpAndSettle();
}

Future<void> _tapVisible(WidgetTester tester, Finder finder) async {
  await tester.ensureVisible(finder);
  await tester.pumpAndSettle();
  expect(finder.hitTestable(), findsOneWidget);
  await tester.tap(finder);
  await tester.pumpAndSettle();
}

void main() {
  testWidgets('text alpha submits, explains bounded evidence, and deletes', (
    tester,
  ) async {
    final api = _Api()..empty = true;
    await _openScreen(tester, api);

    expect(find.text('No private alpha cases yet.'), findsOneWidget);
    expect(find.textContaining('text authorship is unavailable'), findsOneWidget);
    expect(
      tester.widget<FilledButton>(find.byType(FilledButton)).onPressed,
      isNull,
    );

    await tester.tap(find.byType(DropdownButtonFormField<String>));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Text only').last);
    await tester.pumpAndSettle();
    await tester.enterText(find.byType(TextField).first, 'A private caption.');
    await tester.tap(find.byType(CheckboxListTile));
    await tester.pumpAndSettle();
    await _tapVisible(tester, find.widgetWithText(FilledButton, 'Submit text'));

    expect(api.calls, contains('POST text'));
    expect(find.textContaining('text: queued'), findsOneWidget);
    await _tapVisible(tester, find.textContaining('text: queued'));
    expect(find.text('Result and component execution'), findsOneWidget);
    expect(find.textContaining('Processing completed'), findsOneWidget);

    await tester.enterText(find.byType(TextField).last, 'Please review.');
    await _tapVisible(tester, find.widgetWithText(TextButton, 'Send feedback'));
    await _tapVisible(tester, find.widgetWithText(TextButton, 'Request review'));
    await _tapVisible(tester, find.widgetWithText(TextButton, 'Request explanation'));
    expect(api.calls, contains('POST /alpha-case/advice'));
    expect(find.widgetWithText(TextButton, 'Request explanation'), findsNothing);

    await _tapVisible(tester, find.widgetWithText(TextButton, 'Delete case'));
    expect(find.text('No private alpha cases yet.'), findsOneWidget);
  });

  testWidgets('image alpha preserves upload progress and renders observations', (
    tester,
  ) async {
    final api = _Api()..empty = true;
    final bytes = api.imageBytes;
    await _openScreen(
      tester,
      api,
      picker: () async => XFile.fromData(bytes, name: 'authorized.png'),
    );

    await tester.tap(find.byType(DropdownButtonFormField<String>));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Image only').last);
    await tester.pumpAndSettle();
    await tester.tap(find.byType(CheckboxListTile));
    await tester.pumpAndSettle();
    await _tapVisible(tester, find.widgetWithText(FilledButton, 'Select and submit'));
    expect(api.calls, contains('UPLOAD image/png'));
    expect(find.textContaining('image: queued'), findsOneWidget);
    await _tapVisible(tester, find.textContaining('image: queued'));

    expect(find.text('Moondream observations'), findsOneWidget);
    expect(find.text('scene: available — A bounded visual observation.'), findsOneWidget);
    expect(find.bySemanticsLabel('Private alpha image'), findsOneWidget);
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.inactive);
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
    await tester.pumpAndSettle();
    expect(api.calls, contains('GET /alpha-case'));
  });

  testWidgets('alpha reports unavailable and action failures without crashing', (
    tester,
  ) async {
    final api = _Api()..fail = true;
    await _openScreen(tester, api);
    expect(
      find.textContaining('Private alpha is unavailable'),
      findsOneWidget,
    );

    api.fail = false;
    await _tapVisible(tester, find.byTooltip('Refresh cases'));
    await _tapVisible(tester, find.textContaining('image: complete'));
    api.fail = true;
    await _tapVisible(tester, find.widgetWithText(TextButton, 'Send feedback'));
    expect(find.text('That case action could not finish.'), findsOneWidget);
  });
}
