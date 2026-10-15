// ignore_for_file: public_member_api_docs

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lythaus/design_system/widgets/lyth_brand.dart';
import 'package:url_launcher/url_launcher.dart';

import 'package:lythaus/features/auth/application/auth_providers.dart';
import 'package:lythaus/ui/components/lythaus_bottom_nav.dart';
import 'package:lythaus/ui/components/lythaus_side_navigation.dart';
import 'package:lythaus/ui/components/reading_pane.dart';
import 'package:lythaus/ui/components/sign_in_required.dart';
import 'package:lythaus/ui/screens/create/create_screen.dart';
import 'package:lythaus/ui/screens/home/home_feed_navigator.dart';
import 'package:lythaus/ui/screens/profile/profile_screen.dart';
import 'package:lythaus/ui/screens/profile/settings_screen.dart';
import 'package:lythaus/ui/screens/rewards/rewards_dashboard.dart';

const double kDesktopBreakpoint = 768;

class AdaptiveShell extends ConsumerStatefulWidget {
  const AdaptiveShell({super.key, this.initialIndex = 0});

  final int initialIndex;

  @override
  ConsumerState<AdaptiveShell> createState() => _AdaptiveShellState();
}

class _AdaptiveShellState extends ConsumerState<AdaptiveShell> {
  late int _currentIndex;
  final Set<int> _visited = {0};
  final List<int> _history = [];

  @override
  void initState() {
    super.initState();
    _currentIndex = widget.initialIndex.clamp(0, 3);
    _visited.add(_currentIndex);
  }

  @override
  void didUpdateWidget(AdaptiveShell oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.initialIndex != widget.initialIndex) {
      if (_history.isNotEmpty && _history.last == widget.initialIndex) {
        _history.removeLast();
      }
      _currentIndex = widget.initialIndex.clamp(0, 3);
      _visited.add(_currentIndex);
    }
  }

  void _onTabTapped(int index) {
    if (index == _currentIndex) return;
    setState(() {
      _history.add(_currentIndex);
      _currentIndex = index;
      _visited.add(index);
    });
    final router = GoRouter.maybeOf(context);
    if (router != null) {
      final uri = GoRouterState.of(context).uri;
      router.go(
        Uri(
          path: '/',
          queryParameters: {
            ...uri.queryParameters,
            'tab': ['discover', 'create', 'profile', 'rewards'][index],
          },
        ).toString(),
      );
    }
  }

  void _openSettings() {
    final router = GoRouter.maybeOf(context);
    if (router != null) {
      router.go(
        GoRouterState.of(context).uri.replace(path: '/settings').toString(),
      );
      return;
    }
    Navigator.of(
      context,
    ).push(MaterialPageRoute<void>(builder: (_) => const SettingsScreen()));
  }

  Future<void> _openHelp() async {
    try {
      if (await launchUrl(Uri.https('lythaus.co', '/help'))) return;
    } catch (_) {}
    if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Help is available at lythaus.co/help.')),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final currentUser = ref.watch(currentUserProvider);
    final tabs = <Widget>[
      const HomeFeedNavigator(section: AlphaFeedSection.discover),
      currentUser == null
          ? const Scaffold(
              body: SignInRequired(
                message: 'Sign in to create a post.',
                returnTo: '/?tab=create',
              ),
            )
          : const CreateScreen(),
      const ProfileScreen(),
      currentUser == null
          ? const Scaffold(
              body: SignInRequired(
                message: 'Sign in to view your rewards.',
                returnTo: '/?tab=rewards',
              ),
            )
          : const RewardsDashboardScreen(),
    ];
    final content = ReadingPane(
      child: IndexedStack(
        index: _currentIndex,
        children: [
          for (var i = 0; i < tabs.length; i += 1)
            _visited.contains(i)
                ? TickerMode(enabled: _currentIndex == i, child: tabs[i])
                : const SizedBox.shrink(),
        ],
      ),
    );
    return PopScope(
      canPop: _history.isEmpty,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop && _history.isNotEmpty) {
          setState(() => _currentIndex = _history.removeLast());
          final router = GoRouter.maybeOf(context);
          if (router != null) {
            final uri = GoRouterState.of(context).uri;
            router.replace<void>(
              Uri(
                path: '/',
                queryParameters: {
                  ...uri.queryParameters,
                  'tab': [
                    'discover',
                    'create',
                    'profile',
                    'rewards',
                  ][_currentIndex],
                },
              ).toString(),
            );
          }
        }
      },
      child: LayoutBuilder(
        builder: (context, constraints) {
          final scale = MediaQuery.textScalerOf(context).scale(14) / 14;
          final desktop = constraints.maxWidth / scale >= kDesktopBreakpoint;
          return Scaffold(
            body: desktop
                ? Row(
                    children: [
                      LythausSideNavigation(
                        currentIndex: _currentIndex,
                        onDestinationSelected: _onTabTapped,
                        onSettings: _openSettings,
                        onHelp: _openHelp,
                        extended: constraints.maxWidth >= 1100,
                        brand: constraints.maxWidth >= 1100
                            ? const Row(
                                mainAxisSize: MainAxisSize.min,
                                children: [
                                  LythBrandMark(excludeFromSemantics: true),
                                  SizedBox(width: 12),
                                  LythBrandWordmark(),
                                ],
                              )
                            : const LythBrandMark(),
                      ),
                      const VerticalDivider(width: 1),
                      Expanded(child: content),
                    ],
                  )
                : content,
            bottomNavigationBar: desktop
                ? null
                : LythausBottomNav(
                    currentIndex: _currentIndex,
                    onTap: _onTabTapped,
                  ),
          );
        },
      ),
    );
  }
}
