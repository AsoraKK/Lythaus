import 'package:dio/dio.dart';
import 'dart:typed_data';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lythaus/features/authenticity/beta_api.dart';
import 'package:lythaus/features/authenticity/beta_screen.dart';

class _Api extends BetaApi {
  _Api() : super(Dio(), () async => 'test');
  final calls = <String>[];
  @override
  Future<Uint8List?> image(String caseId) async => null;
  Map<String, dynamic> get item => {
    'caseId': 'fixture-case',
    'status': 'complete',
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
    return suffix.isEmpty
        ? {
            'items': [item],
          }
        : item;
  }
}

void main() {
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
