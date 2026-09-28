import 'dart:io';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lythaus/design_system/theme/lyth_theme.dart';
import 'package:lythaus/features/moderation/domain/moderation_queue_item.dart';
import 'package:lythaus/features/moderation/presentation/moderation_console/widgets/moderation_decision_panel.dart';
import 'package:lythaus/features/moderation/presentation/moderation_console/widgets/moderation_queue_item_tile.dart';
import 'package:lythaus/features/privacy/widgets/cooldown_row.dart';
import 'package:lythaus/features/privacy/widgets/delete_section.dart';
import 'package:lythaus/features/privacy/widgets/export_section.dart';
import 'package:lythaus/ui/components/reading_pane.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUpAll(() async {
    final fonts = FontLoader('Manrope');
    for (final weight in [
      'Regular',
      'Medium',
      'SemiBold',
      'Bold',
      'ExtraBold',
    ]) {
      fonts.addFont(rootBundle.load('assets/fonts/Manrope-$weight.ttf'));
    }
    await fonts.load();
    await (FontLoader(
      'MaterialIcons',
    )..addFont(rootBundle.load('fonts/MaterialIcons-Regular.otf'))).load();
  });

  final scenarios = <String, Widget Function()>{
    'review-queue': () => ModerationQueueItemTile(
      item: ModerationQueueItem(
        id: 'fixture-case',
        type: ModerationItemType.appeal,
        contentId: 'fixture-content',
        contentType: 'post',
        contentTitle:
            'A long title that remains readable when reviewing a reported contribution',
        contentPreview:
            'Synthetic review fixture. This content is awaiting a decision, not confirmed as a violation.',
        authorHandle: 'a_long_example_author_handle',
        createdAt: DateTime(2026, 9, 26),
        severity: ModerationSeverityLevel.medium,
        status: 'pending',
        queue: 'general_review',
        reportCount: 12,
        reviewerDecisions: 3,
        isEscalated: true,
      ),
      onTap: () {},
    ),
    'decision': () => ModerationDecisionPanel(onSubmit: (_) {}),
    'privacy-export': () => PrivacyExportSection(
      isBusy: false,
      isCoolingDown: true,
      buttonLabel: 'Try again in 23 hours and 59 minutes',
      onRequest: null,
      onRefresh: () {},
      cooldownRow: const PrivacyCooldownRow(
        lastRequestLabel: 'Last request: 26 September 2026 at 09:00',
        nextAvailableLabel: 'Next request available in 23 hours and 59 minutes',
      ),
    ),
    'privacy-delete': () =>
        PrivacyDeleteSection(onDelete: () {}, isProcessing: false),
  };
  for (final brightness in Brightness.values) {
    for (final scenario in scenarios.entries) {
      for (final layout in [(320.0, 2.0), (390.0, 1.0), (1440.0, 1.0)]) {
        testWidgets(
          '${scenario.key} ${brightness.name} ${layout.$1}px ${layout.$2}x text',
          (tester) async {
            tester.view.physicalSize = Size(layout.$1, 900);
            tester.view.devicePixelRatio = 1;
            addTearDown(tester.view.resetPhysicalSize);
            addTearDown(tester.view.resetDevicePixelRatio);
            final boundary = GlobalKey();
            await tester.pumpWidget(
              RepaintBoundary(
                key: boundary,
                child: MaterialApp(
                  theme: brightness == Brightness.dark
                      ? LythausTheme.dark()
                      : LythausTheme.light(),
                  home: MediaQuery(
                    data: MediaQueryData(
                      textScaler: TextScaler.linear(layout.$2),
                    ),
                    child: ReadingPane(
                      child: Scaffold(
                        appBar: AppBar(title: const Text('Fixture preview')),
                        body: SingleChildScrollView(
                          padding: const EdgeInsets.all(16),
                          child: scenario.value(),
                        ),
                      ),
                    ),
                  ),
                ),
              ),
            );
            await tester.pumpAndSettle();
            expect(tester.takeException(), isNull);
            final evidence = Platform.environment['LYTHAUS_WIDGET_EVIDENCE'];
            if (evidence != null) {
              await tester.runAsync(() async {
                final image =
                    await (boundary.currentContext!.findRenderObject()!
                            as RenderRepaintBoundary)
                        .toImage(pixelRatio: 1);
                final bytes = await image.toByteData(
                  format: ui.ImageByteFormat.png,
                );
                final file = File(
                  '$evidence/${scenario.key}-${brightness.name}-${layout.$1.toInt()}.png',
                );
                await file.parent.create(recursive: true);
                await file.writeAsBytes(bytes!.buffer.asUint8List());
                image.dispose();
              });
            }
          },
        );
      }
    }
  }
}
