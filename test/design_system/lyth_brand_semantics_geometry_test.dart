import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lythaus/design_system/widgets/lyth_brand.dart';

void main() {
  testWidgets('named wordmark semantics stays within its artwork slot', (
    tester,
  ) async {
    final semantics = tester.ensureSemantics();
    try {
      await tester.pumpWidget(
        const MaterialApp(
          home: Scaffold(
            body: Align(
              alignment: Alignment.topLeft,
              child: Padding(padding: EdgeInsets.all(24), child: LythBrand()),
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();

      final image = find.bySemanticsLabel('Lythaus');
      expect(image, findsOneWidget);
      final bounds = tester.getSemantics(image).rect;
      expect(bounds.height, 32);
      expect(bounds.width, closeTo(32 * 470.28944891 / 130.6866688, .001));
      expect(tester.takeException(), isNull);
    } finally {
      semantics.dispose();
    }
  });
}
