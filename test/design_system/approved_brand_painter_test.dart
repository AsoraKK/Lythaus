import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter_svg/flutter_svg.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lythaus/design_system/widgets/approved_brand_paths.g.dart';
import 'package:lythaus/design_system/widgets/lyth_brand.dart';

void main() {
  for (final asset in approvedBrandViewBoxes.keys) {
    for (final height in [16.0, 24.0, 32.0, 40.0, 64.0, 128.0]) {
      for (final widthFactor in [0.5, 1.0, 1.25]) {
        testWidgets(
          '$asset matches approved SVG at height $height, width factor $widthFactor',
          (tester) async {
            final bounds = approvedBrandViewBoxes[asset]!;
            final size = Size(
              height * bounds.width / bounds.height * widthFactor,
              height,
            );
            final key = GlobalKey();
            Future<List<int>> pixels(Widget child) async {
              await tester.pumpWidget(
                Directionality(
                  textDirection: TextDirection.ltr,
                  child: Center(
                    child: RepaintBoundary(
                      key: key,
                      child: SizedBox(
                        width: size.width,
                        height: size.height,
                        child: child,
                      ),
                    ),
                  ),
                ),
              );
              await tester.pumpAndSettle();
              return (await tester.runAsync(() async {
                final boundary =
                    key.currentContext!.findRenderObject()!
                        as RenderRepaintBoundary;
                final image = await boundary.toImage(pixelRatio: 2);
                final bytes = await image.toByteData(
                  format: ui.ImageByteFormat.rawRgba,
                );
                final result = bytes!.buffer.asUint8List().toList();
                image.dispose();
                return result;
              }))!;
            }

            final expected = await pixels(
              SvgPicture.asset(
                'assets/brand/lythaus-v1/$asset',
                width: size.width,
                height: size.height,
              ),
            );
            final actual = await pixels(
              CustomPaint(painter: ApprovedBrandPainter(asset)),
            );
            expect(actual.length, expected.length);
            var totalDifference = 0;
            var visible = 0;
            for (var i = 0; i < actual.length; i++) {
              totalDifference += (actual[i] - expected[i]).abs();
              if (i % 4 == 3 && expected[i] > 0) visible++;
            }
            expect(visible, greaterThan(16));
            expect(
              totalDifference / (actual.length * 255),
              lessThan(0.005),
              reason:
                  'Generated outlines must match approved SVG pixels, including transforms and colors',
            );
            expect(tester.takeException(), isNull);
          },
        );
      }
    }
  }
}
