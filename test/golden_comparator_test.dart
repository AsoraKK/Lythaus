import 'dart:io';
import 'dart:typed_data';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'golden_test_utils.dart';

Future<Uint8List> imageBytes(int changedWidth) async {
  final recorder = ui.PictureRecorder();
  final canvas = Canvas(recorder);
  canvas.drawRect(
    const Rect.fromLTWH(0, 0, 10, 10),
    Paint()..color = Colors.black,
  );
  canvas.drawRect(
    Rect.fromLTWH(0, 0, changedWidth.toDouble(), 10),
    Paint()..color = Colors.white,
  );
  final picture = recorder.endRecording();
  final image = await picture.toImage(10, 10);
  final data = await image.toByteData(format: ui.ImageByteFormat.png);
  image.dispose();
  picture.dispose();
  return data!.buffer.asUint8List();
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  test(
    'golden comparator uses a fractional tolerance, not a percentage',
    () async {
      final directory = await Directory.systemTemp.createTemp(
        'lythaus-golden-check-',
      );
      addTearDown(() => directory.delete(recursive: true));
      final golden = File('${directory.path}/baseline.png');
      await golden.writeAsBytes(await imageBytes(0));
      final comparator = TolerantGoldenFileComparator(
        Uri.file('${directory.path}/comparator_test.dart'),
        tolerance: 0.15,
      );
      expect(await comparator.compare(await imageBytes(1), golden.uri), isTrue);
      await expectLater(
        comparator.compare(await imageBytes(2), golden.uri),
        throwsA(isA<FlutterError>()),
      );
      await expectLater(
        comparator.compare(await imageBytes(10), golden.uri),
        throwsA(isA<FlutterError>()),
      );
    },
  );
}
