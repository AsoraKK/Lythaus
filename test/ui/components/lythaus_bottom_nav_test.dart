import 'dart:ui' show Tristate;

import 'package:flutter/material.dart';
import 'package:flutter/semantics.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:lythaus/data/mock/mock_settings.dart';
import 'package:lythaus/state/models/settings.dart';
import 'package:lythaus/state/providers/settings_providers.dart';
import 'package:lythaus/ui/components/lythaus_bottom_nav.dart';

Widget _buildNav({
  required SettingsState settings,
  required ValueChanged<int> onTap,
  int currentIndex = 0,
}) {
  return ProviderScope(
    overrides: [
      settingsProvider.overrideWith((ref) => _FakeSettingsController(settings)),
    ],
    child: MaterialApp(
      home: Scaffold(
        bottomNavigationBar: LythausBottomNav(
          currentIndex: currentIndex,
          onTap: onTap,
        ),
      ),
    ),
  );
}

void main() {
  testWidgets('renders default order and maps taps in right-handed mode', (
    tester,
  ) async {
    var tappedIndex = -1;

    await tester.pumpWidget(
      _buildNav(
        settings: defaultSettings.copyWith(leftHandedMode: false),
        currentIndex: 1,
        onTap: (index) => tappedIndex = index,
      ),
    );

    expect(find.text('Feed'), findsOneWidget);
    expect(find.text('Search'), findsOneWidget);
    expect(find.text('Notifications'), findsOneWidget);
    expect(find.text('Profile'), findsOneWidget);
    expect(find.text('My Feeds'), findsNothing);
    expect(find.text('News Board'), findsNothing);

    for (final entry in [
      ('Feed', 0),
      ('Search', 4),
      ('Notifications', 5),
      ('Profile', 2),
    ]) {
      await tester.tap(find.text(entry.$1));
      await tester.pump();
      expect(tappedIndex, entry.$2);
    }
  });

  testWidgets('mirrors order and tap mapping in left-handed mode', (
    tester,
  ) async {
    var tappedIndex = -1;

    await tester.pumpWidget(
      _buildNav(
        settings: defaultSettings.copyWith(leftHandedMode: true),
        currentIndex: 0,
        onTap: (index) => tappedIndex = index,
      ),
    );

    final labels = tester
        .widgetList<Text>(
          find.descendant(
            of: find.byType(LythausBottomNav),
            matching: find.byType(Text),
          ),
        )
        .map((text) => text.data)
        .toList();
    expect(labels, ['Profile', 'Notifications', 'Search', 'Feed']);

    await tester.tap(find.text('Profile'));
    await tester.pump();
    expect(tappedIndex, 2);
  });

  testWidgets('selected destination is focusable and named', (tester) async {
    final semantics = tester.ensureSemantics();
    try {
      await tester.pumpWidget(
        _buildNav(settings: defaultSettings, currentIndex: 0, onTap: (_) {}),
      );
      final feed = tester.getSemantics(find.text('Feed')).getSemanticsData();
      expect(feed.label, 'Feed');
      expect(feed.flagsCollection.isButton, isTrue);
      expect(feed.flagsCollection.isSelected, Tristate.isTrue);
      expect(feed.flagsCollection.isFocused, isNot(Tristate.none));
      expect(feed.hasAction(SemanticsAction.tap), isTrue);
    } finally {
      semantics.dispose();
    }
  });

  testWidgets('large labels remain usable on a narrow screen', (tester) async {
    await tester.binding.setSurfaceSize(const Size(320, 800));
    addTearDown(() => tester.binding.setSurfaceSize(null));
    await tester.pumpWidget(
      MediaQuery(
        data: const MediaQueryData(textScaler: TextScaler.linear(2)),
        child: _buildNav(settings: defaultSettings, onTap: (_) {}),
      ),
    );
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
    for (final label in ['Feed', 'Search', 'Notifications', 'Profile']) {
      expect(find.text(label).hitTestable(), findsOneWidget);
    }
    expect(
      tester.getTopLeft(find.text('Notifications')).dy,
      greaterThan(tester.getTopLeft(find.text('Feed')).dy),
    );
  });
}

class _FakeSettingsController extends SettingsController {
  _FakeSettingsController(SettingsState seed) : super() {
    state = seed;
  }
}
