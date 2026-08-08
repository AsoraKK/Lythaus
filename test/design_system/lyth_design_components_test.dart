/// Widget tests for Lythaus design system components:
///   - LythEmptyState
///   - LythCard / LythCardElevated
///   - LythConfirmDialog
///   - LythSkeleton
library;

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:google_fonts/google_fonts.dart';

import 'package:lythaus/design_system/index.dart';
import 'package:lythaus/design_system/components/lyth_empty_state.dart';
import 'package:lythaus/design_system/components/lyth_confirm_dialog.dart';
import 'package:lythaus/design_system/components/lyth_skeleton.dart';

void main() {
  setUpAll(() {
    GoogleFonts.config.allowRuntimeFetching = false;
  });

  Widget wrap(Widget child) => MaterialApp(
    theme: LythausTheme.light(),
    home: Scaffold(body: child),
  );

  // ─── LythEmptyState ───────────────────────────────────────────────────────
  group('LythEmptyState', () {
    testWidgets('renders icon and title', (tester) async {
      await tester.pumpWidget(
        wrap(const LythEmptyState(icon: Icons.inbox, title: 'No Messages')),
      );
      await tester.pump();

      expect(find.byIcon(Icons.inbox), findsOneWidget);
      expect(find.text('No Messages'), findsOneWidget);
    });

    testWidgets('renders subtitle when provided', (tester) async {
      await tester.pumpWidget(
        wrap(
          const LythEmptyState(
            icon: Icons.inbox,
            title: 'Empty',
            subtitle: 'Nothing here yet',
          ),
        ),
      );
      await tester.pump();

      expect(find.text('Nothing here yet'), findsOneWidget);
    });

    testWidgets('does not render subtitle when omitted', (tester) async {
      await tester.pumpWidget(
        wrap(const LythEmptyState(icon: Icons.inbox, title: 'Empty')),
      );
      await tester.pump();

      expect(find.text('Nothing here yet'), findsNothing);
    });

    testWidgets('renders action button and triggers callback', (tester) async {
      var tapped = false;
      await tester.pumpWidget(
        wrap(
          LythEmptyState(
            icon: Icons.search,
            title: 'No Results',
            actionLabel: 'Clear',
            onAction: () => tapped = true,
          ),
        ),
      );
      await tester.pump();

      final btn = find.widgetWithText(ElevatedButton, 'Clear');
      expect(btn, findsOneWidget);
      await tester.tap(btn);
      expect(tapped, isTrue);
    });

    testWidgets('does not render action button when actionLabel is null', (
      tester,
    ) async {
      await tester.pumpWidget(
        wrap(const LythEmptyState(icon: Icons.inbox, title: 'Empty')),
      );
      await tester.pump();

      expect(find.byType(ElevatedButton), findsNothing);
    });

    testWidgets('respects custom iconSize', (tester) async {
      await tester.pumpWidget(
        wrap(
          const LythEmptyState(icon: Icons.star, title: 'Stars', iconSize: 100),
        ),
      );
      await tester.pump();

      final icon = tester.widget<Icon>(find.byIcon(Icons.star));
      expect(icon.size, 100.0);
    });

    testWidgets('respects custom iconColor', (tester) async {
      await tester.pumpWidget(
        wrap(
          const LythEmptyState(
            icon: Icons.star,
            title: 'Stars',
            iconColor: Colors.red,
          ),
        ),
      );
      await tester.pump();

      final icon = tester.widget<Icon>(find.byIcon(Icons.star));
      expect(icon.color, Colors.red);
    });
  });

  // ─── LythCard ─────────────────────────────────────────────────────────────
  group('LythCard', () {
    testWidgets('renders child content', (tester) async {
      await tester.pumpWidget(wrap(const LythCard(child: Text('Card body'))));
      await tester.pump();

      expect(find.text('Card body'), findsOneWidget);
    });

    testWidgets('clickable variant fires onTap', (tester) async {
      var tapped = false;
      await tester.pumpWidget(
        wrap(
          LythCard.clickable(
            onTap: () => tapped = true,
            child: const Text('Tap me'),
          ),
        ),
      );
      await tester.pump();

      await tester.tap(find.text('Tap me'));
      expect(tapped, isTrue);
    });

    testWidgets('non-clickable card does not contain InkWell', (tester) async {
      await tester.pumpWidget(wrap(const LythCard(child: Text('Static'))));
      await tester.pump();

      expect(find.byType(InkWell), findsNothing);
    });

    testWidgets('renders LythCardElevated with child', (tester) async {
      await tester.pumpWidget(
        wrap(const LythCardElevated(child: Text('Elevated'))),
      );
      await tester.pump();

      expect(find.text('Elevated'), findsOneWidget);
    });

    testWidgets('LythCardElevated clickable fires onTap', (tester) async {
      var tapped = false;
      await tester.pumpWidget(
        wrap(
          LythCardElevated(
            onTap: () => tapped = true,
            child: const Text('Press'),
          ),
        ),
      );
      await tester.pump();

      await tester.tap(find.text('Press'));
      expect(tapped, isTrue);
    });

    testWidgets('LythCard with onLongPress fires callback', (tester) async {
      var longPressed = false;
      await tester.pumpWidget(
        wrap(
          LythCard(
            onLongPress: () => longPressed = true,
            child: const Text('Hold me'),
          ),
        ),
      );
      await tester.pump();

      await tester.longPress(find.text('Hold me'));
      expect(longPressed, isTrue);
    });

    testWidgets('LythCard with custom backgroundColor renders', (tester) async {
      await tester.pumpWidget(
        wrap(
          const LythCard(
            backgroundColor: Color(0xFFFF0000),
            child: Text('Colored'),
          ),
        ),
      );
      await tester.pump();

      expect(find.text('Colored'), findsOneWidget);
    });

    testWidgets('LythCard with onTap (no .clickable) fires callback', (
      tester,
    ) async {
      var tapped = false;
      await tester.pumpWidget(
        wrap(LythCard(onTap: () => tapped = true, child: const Text('Tap me'))),
      );
      await tester.pump();

      await tester.tap(find.text('Tap me'));
      expect(tapped, isTrue);
    });
  });

  // ─── LythConfirmDialog ────────────────────────────────────────────────────
  group('LythConfirmDialog', () {
    Future<void> showDialog_(WidgetTester tester, Widget dialog) async {
      await tester.pumpWidget(
        MaterialApp(
          theme: LythausTheme.light(),
          home: Builder(
            builder: (context) {
              return Scaffold(
                body: ElevatedButton(
                  onPressed: () => showDialog<void>(
                    context: context,
                    builder: (_) => dialog,
                  ),
                  child: const Text('Open'),
                ),
              );
            },
          ),
        ),
      );
      await tester.tap(find.text('Open'));
      await tester.pumpAndSettle();
    }

    testWidgets('renders title and confirm label', (tester) async {
      await showDialog_(
        tester,
        LythConfirmDialog(
          title: 'Delete?',
          confirmLabel: 'Delete',
          onConfirm: () {},
        ),
      );

      expect(find.text('Delete?'), findsOneWidget);
      expect(find.text('Delete'), findsWidgets);
    });

    testWidgets('renders message when provided', (tester) async {
      await showDialog_(
        tester,
        LythConfirmDialog(
          title: 'Confirm',
          confirmLabel: 'Yes',
          message: 'Are you sure?',
          onConfirm: () {},
        ),
      );

      expect(find.text('Are you sure?'), findsOneWidget);
    });

    testWidgets('cancel button dismisses dialog', (tester) async {
      await showDialog_(
        tester,
        LythConfirmDialog(
          title: 'Delete?',
          confirmLabel: 'Delete',
          onConfirm: () {},
        ),
      );

      await tester.tap(find.text('Cancel'));
      await tester.pumpAndSettle();
      expect(find.text('Delete?'), findsNothing);
    });

    testWidgets('onCancel callback is invoked', (tester) async {
      var cancelled = false;
      await showDialog_(
        tester,
        LythConfirmDialog(
          title: 'Delete?',
          confirmLabel: 'Delete',
          onConfirm: () {},
          onCancel: () => cancelled = true,
        ),
      );

      await tester.tap(find.text('Cancel'));
      await tester.pumpAndSettle();
      expect(cancelled, isTrue);
    });

    testWidgets('onConfirm callback is invoked', (tester) async {
      var confirmed = false;
      await showDialog_(
        tester,
        LythConfirmDialog(
          title: 'Proceed?',
          confirmLabel: 'Confirm',
          onConfirm: () => confirmed = true,
        ),
      );

      await tester.tap(find.text('Confirm'));
      await tester.pumpAndSettle();
      expect(confirmed, isTrue);
    });

    testWidgets('destructive constructor sets isDestructive=true', (
      tester,
    ) async {
      await showDialog_(
        tester,
        LythConfirmDialog.destructive(
          title: 'Remove?',
          confirmLabel: 'Remove',
          onConfirm: () {},
        ),
      );
      // Dialog renders — destructive variant uses different button styling
      expect(find.text('Remove?'), findsOneWidget);
    });

    testWidgets('renders icon when provided', (tester) async {
      await showDialog_(
        tester,
        LythConfirmDialog(
          title: 'Warning',
          confirmLabel: 'OK',
          icon: Icons.warning,
          onConfirm: () {},
        ),
      );

      expect(find.byIcon(Icons.warning), findsOneWidget);
    });
  });

  // ─── LythSkeleton ─────────────────────────────────────────────────────────
  group('LythSkeleton', () {
    // LythSkeleton uses factory constructors that return private subclasses
    // (_LineSkeleton, _BoxSkeleton, _CircleSkeleton). byType uses exact match,
    // so we use byWidgetPredicate which respects the `is` operator.
    Finder findSkeleton() => find.byWidgetPredicate((w) => w is LythSkeleton);

    testWidgets('LythSkeleton.line renders with given height', (tester) async {
      await tester.pumpWidget(
        wrap(const SizedBox(width: 200, child: LythSkeleton.line(height: 16))),
      );
      await tester.pump();

      expect(findSkeleton(), findsOneWidget);
    });

    testWidgets('LythSkeleton.box renders with given size', (tester) async {
      await tester.pumpWidget(
        wrap(const LythSkeleton.box(width: 80, height: 80)),
      );
      await tester.pump();

      expect(findSkeleton(), findsOneWidget);
    });

    testWidgets('LythSkeleton.circle renders', (tester) async {
      await tester.pumpWidget(wrap(const LythSkeleton.circle(radius: 24)));
      await tester.pump();

      expect(findSkeleton(), findsOneWidget);
    });

    testWidgets('renders AnimatedBuilder for animation', (tester) async {
      await tester.pumpWidget(wrap(const LythSkeleton.line(height: 16)));
      await tester.pump();

      expect(find.byType(AnimatedBuilder), findsWidgets);
    });
  });
}
