// ignore_for_file: public_member_api_docs

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:lythaus/design_system/widgets/lyth_brand.dart';

import 'package:lythaus/features/auth/application/auth_providers.dart';
import 'package:lythaus/features/notifications/presentation/notifications_screen.dart';
import 'package:lythaus/ui/components/lythaus_bottom_nav.dart';
import 'package:lythaus/ui/components/lythaus_side_navigation.dart';
import 'package:lythaus/ui/components/reading_pane.dart';
import 'package:lythaus/ui/components/sign_in_required.dart';
import 'package:lythaus/ui/screens/create/create_screen.dart';
import 'package:lythaus/ui/screens/home/home_feed_navigator.dart';
import 'package:lythaus/ui/screens/home/feed_search_screen.dart';
import 'package:lythaus/ui/screens/profile/profile_screen.dart';
import 'package:lythaus/ui/screens/profile/settings_screen.dart';
import 'package:lythaus/ui/screens/rewards/rewards_dashboard.dart';

const double kDesktopBreakpoint = 768;

class AdaptiveShell extends ConsumerStatefulWidget {
  const AdaptiveShell({
    super.key,
    this.initialIndex = 0,
    this.brand,
    this.initialFeedId,
    this.initialSearchQuery = '',
  });

  final int initialIndex;
  final Widget? brand;
  final String? initialFeedId;
  final String initialSearchQuery;

  @override
  ConsumerState<AdaptiveShell> createState() => _AdaptiveShellState();
}

class _AdaptiveShellState extends ConsumerState<AdaptiveShell> {
  late int _currentIndex;
  late final ValueNotifier<bool> _notificationActive;
  final Set<int> _visited = {0};
  final List<int> _history = [];
  final _contentKey = GlobalKey();
  final _scaffoldKey = GlobalKey<ScaffoldState>();
  final _feedKey = GlobalKey<HomeFeedNavigatorState>();
  static const _tabNames = [
    'discover',
    'create',
    'profile',
    'rewards',
    'search',
    'notifications',
  ];
  final _tabFocusScopes = List.generate(
    6,
    (_) => FocusScopeNode(
      traversalEdgeBehavior: TraversalEdgeBehavior.parentScope,
    ),
  );
  final _rememberedFocus = List<FocusNode?>.filled(6, null);

  void _prepareTabFocus(int nextIndex) {
    if (nextIndex == _currentIndex) return;
    final focused = _tabFocusScopes[_currentIndex].focusedChild;
    if (focused != null) _rememberedFocus[_currentIndex] = focused;
    final target = _rememberedFocus[nextIndex];
    if (target == null) return;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted &&
          _currentIndex == nextIndex &&
          target.context != null &&
          target.canRequestFocus) {
        target.requestFocus();
      }
    });
  }

  @override
  void dispose() {
    _notificationActive.dispose();
    for (final scope in _tabFocusScopes) {
      scope.dispose();
    }
    super.dispose();
  }

  @override
  void initState() {
    super.initState();
    _currentIndex = widget.initialIndex.clamp(0, 5);
    _notificationActive = ValueNotifier(_currentIndex == 5);
    _visited.add(_currentIndex);
  }

  @override
  void didUpdateWidget(AdaptiveShell oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.initialIndex != widget.initialIndex) {
      _notificationActive.value = widget.initialIndex.clamp(0, 5) == 5;
      _prepareTabFocus(widget.initialIndex.clamp(0, 5));
      if (_history.isNotEmpty && _history.last == widget.initialIndex) {
        _history.removeLast();
      }
      _currentIndex = widget.initialIndex.clamp(0, 5);
      _visited.add(_currentIndex);
    }
  }

  void _onTabTapped(int index) {
    if (index == _currentIndex) return;
    _notificationActive.value = index == 5;
    _prepareTabFocus(index);
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
          queryParameters: {...uri.queryParameters, 'tab': _tabNames[index]},
        ).toString(),
      );
    }
  }

  void _openFeedSection(ValueChanged<HomeFeedNavigatorState> action) {
    _onTabTapped(0);
    WidgetsBinding.instance.addPostFrameCallback((_) {
      final feed = _feedKey.currentState;
      if (mounted && feed != null) action(feed);
    });
  }

  Widget _accountDrawer(bool signedIn) => Drawer(
    width: (MediaQuery.sizeOf(context).width * .88).clamp(0, 320),
    child: SafeArea(
      child: ListView(
        padding: const EdgeInsets.symmetric(vertical: 16),
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(24, 8, 24, 20),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const CircleAvatar(child: Icon(Icons.person_outline)),
                const SizedBox(height: 12),
                Text(
                  signedIn ? 'Your account' : 'Guest',
                  style: Theme.of(context).textTheme.titleLarge,
                ),
              ],
            ),
          ),
          const Divider(height: 1),
          Builder(
            builder: (drawerContext) {
              void closeAnd(VoidCallback action) {
                Navigator.of(drawerContext).pop();
                action();
              }

              return Column(
                children: [
                  ListTile(
                    leading: const Icon(Icons.person_outline),
                    title: const Text('Profile'),
                    onTap: () => closeAnd(() => _onTabTapped(2)),
                  ),
                  ListTile(
                    leading: const Icon(Icons.edit_outlined),
                    title: const Text('Create'),
                    onTap: () => closeAnd(() => _onTabTapped(1)),
                  ),
                  ListTile(
                    leading: const Icon(Icons.redeem_outlined),
                    title: const Text('Rewards'),
                    onTap: () => closeAnd(() => _onTabTapped(3)),
                  ),
                  ListTile(
                    leading: const Icon(Icons.tune),
                    title: const Text('Manage feeds'),
                    onTap: () => closeAnd(
                      () => _openFeedSection((feed) => feed.openFeedControls()),
                    ),
                  ),
                  ListTile(
                    leading: const Icon(Icons.fact_check_outlined),
                    title: const Text('Review and appeals'),
                    onTap: () => closeAnd(
                      () => _openFeedSection((feed) => feed.showAppeals()),
                    ),
                  ),
                  const Divider(height: 24),
                  ListTile(
                    leading: const Icon(Icons.settings_outlined),
                    title: const Text('Settings'),
                    onTap: () => closeAnd(_openSettings),
                  ),
                  ListTile(
                    leading: const Icon(Icons.help_outline),
                    title: const Text('Help'),
                    onTap: () => closeAnd(_openHelp),
                  ),
                ],
              );
            },
          ),
        ],
      ),
    ),
  );

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
      HomeFeedNavigator(
        key: _feedKey,
        section: AlphaFeedSection.discover,
        initialFeedId: widget.initialFeedId,
        onAccountTap: () => _scaffoldKey.currentState?.openDrawer(),
        onCreateTap: () => _onTabTapped(1),
      ),
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
      FeedSearchScreen(initialQuery: widget.initialSearchQuery),
      NotificationsScreen(activeListenable: _notificationActive),
    ];
    final content = ReadingPane(
      key: _contentKey,
      child: IndexedStack(
        index: _currentIndex,
        children: [
          for (var i = 0; i < tabs.length; i += 1)
            _visited.contains(i)
                ? FocusScope(
                    node: _tabFocusScopes[i],
                    skipTraversal: _currentIndex != i,
                    descendantsAreFocusable: _currentIndex == i,
                    child: TickerMode(
                      enabled: _currentIndex == i,
                      child: tabs[i],
                    ),
                  )
                : const SizedBox.shrink(),
        ],
      ),
    );
    return PopScope(
      canPop: _history.isEmpty,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop && _history.isNotEmpty) {
          _notificationActive.value = _history.last == 5;
          _prepareTabFocus(_history.last);
          setState(() => _currentIndex = _history.removeLast());
          final router = GoRouter.maybeOf(context);
          if (router != null) {
            final uri = GoRouterState.of(context).uri;
            router.replace<void>(
              Uri(
                path: '/',
                queryParameters: {
                  ...uri.queryParameters,
                  'tab': _tabNames[_currentIndex],
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
            key: _scaffoldKey,
            drawer: _accountDrawer(currentUser != null),
            body: desktop
                ? Row(
                    children: [
                      LythausSideNavigation(
                        currentIndex: _currentIndex,
                        onDestinationSelected: _onTabTapped,
                        onSettings: _openSettings,
                        onHelp: _openHelp,
                        extended: constraints.maxWidth >= 1100,
                        brand:
                            widget.brand ??
                            const LythBrand(variant: LythBrandVariant.symbol),
                      ),
                      const VerticalDivider(width: 1),
                      Expanded(child: content),
                    ],
                  )
                : content,
            bottomNavigationBar:
                desktop || MediaQuery.viewInsetsOf(context).bottom > 0
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
