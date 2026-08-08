import 'package:flutter/material.dart';
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

    expect(find.text('Discover'), findsOneWidget);
    expect(find.text('Create'), findsOneWidget);
    expect(find.text('Profile'), findsOneWidget);
    expect(find.text('My Feeds'), findsNothing);
    expect(find.text('News Board'), findsNothing);

    await tester.tap(find.text('Profile'));
    await tester.pump();
    expect(tappedIndex, 2);
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

    final nav = tester.widget<BottomNavigationBar>(
      find.byType(BottomNavigationBar),
    );

    expect(nav.currentIndex, 2);
    expect(nav.items.first.label, 'Profile');
    expect(nav.items.last.label, 'Discover');

    await tester.tap(find.text('Profile'));
    await tester.pump();
    expect(tappedIndex, 2);
  });
}

class _FakeSettingsController extends SettingsController {
  _FakeSettingsController(SettingsState seed) : super() {
    state = seed;
  }
}
