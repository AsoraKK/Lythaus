import 'dart:io';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter_test/flutter_test.dart';

Future<void> captureInactiveStateScreenshot(
  WidgetTester tester,
  GlobalKey key,
  String filename,
) async {
  final directory = Platform.environment['LYTHAUS_INACTIVE_EVIDENCE_DIR'];
  if (directory == null) return;

  await tester.runAsync(() async {
    final boundary =
        key.currentContext!.findRenderObject()! as RenderRepaintBoundary;
    final image = await boundary.toImage(pixelRatio: 2);
    final data = await image.toByteData(format: ui.ImageByteFormat.png);
    await Directory(directory).create(recursive: true);
    await File(
      '$directory/$filename.png',
    ).writeAsBytes(data!.buffer.asUint8List());
    image.dispose();
  });
}
