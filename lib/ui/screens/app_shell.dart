// ignore_for_file: public_member_api_docs

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:lythaus/state/providers/settings_providers.dart';
import 'package:lythaus/features/auth/application/auth_providers.dart';
import 'package:lythaus/ui/components/lythaus_bottom_nav.dart';
import 'package:lythaus/ui/screens/create/create_screen.dart';
import 'package:lythaus/ui/screens/home/home_feed_navigator.dart';
import 'package:lythaus/ui/screens/profile/profile_screen.dart';

class LythausAppShell extends ConsumerStatefulWidget {
  const LythausAppShell({super.key});

  @override
  ConsumerState<LythausAppShell> createState() => _LythausAppShellState();
}

class _LythausAppShellState extends ConsumerState<LythausAppShell> {
  int _currentIndex = 0;

  @override
  Widget build(BuildContext context) {
    final _ = ref.watch(
      leftHandedModeProvider,
    ); // trigger rebuild on mirror toggle
    final isGuest = ref.watch(guestModeProvider);
    const tabs = <Widget>[
      HomeFeedNavigator(section: AlphaFeedSection.discover),
      CreateScreen(),
      ProfileScreen(),
    ];

    return Scaffold(
      body: IndexedStack(
        index: _currentIndex,
        children: [
          for (var i = 0; i < tabs.length; i += 1)
            TickerMode(enabled: _currentIndex == i, child: tabs[i]),
        ],
      ),
      bottomNavigationBar: LythausBottomNav(
        currentIndex: _currentIndex,
        onTap: (index) {
          if (isGuest && index == 1) {
            ScaffoldMessenger.of(context).showSnackBar(
              const SnackBar(
                content: Text('Sign in to use this Alpha feature.'),
              ),
            );
            return;
          }
          setState(() => _currentIndex = index);
        },
      ),
    );
  }
}
