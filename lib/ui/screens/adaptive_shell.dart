// ignore_for_file: public_member_api_docs

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:lythaus/design_system/widgets/lyth_brand.dart';

import 'package:lythaus/features/auth/application/auth_providers.dart';
import 'package:lythaus/features/notifications/presentation/notifications_screen.dart';
import 'package:lythaus/ui/components/editorial_action_bar.dart';
import 'package:lythaus/ui/components/feed_navigation_rail.dart';
import 'package:lythaus/ui/components/feed_swipe_region.dart';
import 'package:lythaus/state/models/feed_models.dart';
import 'package:lythaus/state/providers/feed_providers.dart';
import 'package:lythaus/state/providers/theme_mode_provider.dart';
import 'package:lythaus/state/providers/settings_providers.dart';
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
  int _navigationEpoch = 0;
  late final ValueNotifier<bool> _notificationActive;
  final Set<int> _visited = {0};
  final List<int> _history = [];
  final _contentKey = GlobalKey();
  final _scaffoldKey = GlobalKey<ScaffoldState>();
  final _feedKey = GlobalKey<HomeFeedNavigatorState>();
  final _menuFocus = FocusNode(debugLabel: 'Menu action');
  final _feedFocus = FocusNode(debugLabel: 'Selected feed');
  final _appearanceFocus = {
    for (final mode in ThemeMode.values)
      mode: FocusNode(debugLabel: 'Appearance ${mode.name}'),
  };
  late String _activeFeedId;
  bool _menuOpen = false;
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
    _menuFocus.dispose();
    _feedFocus.dispose();
    for (final node in _appearanceFocus.values) {
      node.dispose();
    }
    for (final scope in _tabFocusScopes) {
      scope.dispose();
    }
    super.dispose();
  }

  @override
  void initState() {
    super.initState();
    _activeFeedId = widget.initialFeedId ?? 'discover';
    _currentIndex = widget.initialIndex.clamp(0, 5);
    _notificationActive = ValueNotifier(_currentIndex == 5);
    _visited.add(_currentIndex);
  }

  @override
  void didUpdateWidget(AdaptiveShell oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.initialFeedId != widget.initialFeedId) {
      _activeFeedId = widget.initialFeedId ?? 'discover';
    }
    if ((oldWidget.initialIndex != widget.initialIndex &&
            widget.initialIndex.clamp(0, 5) != _currentIndex) ||
        oldWidget.initialFeedId != widget.initialFeedId ||
        oldWidget.initialSearchQuery != widget.initialSearchQuery) {
      ++_navigationEpoch;
    }
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
    ++_navigationEpoch;
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
    final epoch = _navigationEpoch;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      final feed = _feedKey.currentState;
      if (mounted &&
          _currentIndex == 0 &&
          epoch == _navigationEpoch &&
          feed != null) {
        action(feed);
      }
    });
  }

  void _openMenu() => _scaffoldKey.currentState?.openEndDrawer();

  void _returnToPrevious() {
    ++_navigationEpoch;
    final previous = _history.isEmpty ? 0 : _history.removeLast();
    _notificationActive.value = previous == 5;
    _prepareTabFocus(previous);
    setState(() => _currentIndex = previous);
    final router = GoRouter.maybeOf(context);
    if (router != null) {
      final uri = GoRouterState.of(context).uri;
      router.replace<void>(
        uri
            .replace(
              queryParameters: {
                ...uri.queryParameters,
                'tab': _tabNames[previous],
              },
            )
            .toString(),
      );
    }
  }

  Widget _accountDrawer(bool signedIn) => Drawer(
    width: (MediaQuery.sizeOf(context).width - 24).clamp(0, 360),
    child: SafeArea(
      child: Builder(
        builder: (drawerContext) {
          void close() => _scaffoldKey.currentState?.closeEndDrawer();
          void closeAnd(VoidCallback action) {
            close();
            action();
          }

          Widget destination(
            String title,
            IconData icon,
            VoidCallback action,
          ) => ListTile(
            leading: Icon(icon),
            title: Text(title),
            onTap: () => closeAnd(action),
          );
          return CallbackShortcuts(
            bindings: {const SingleActivator(LogicalKeyboardKey.escape): close},
            child: ListView(
              padding: const EdgeInsets.all(24),
              children: [
                Row(
                  children: [
                    Expanded(
                      child: Semantics(
                        header: true,
                        child: Text(
                          'Menu',
                          style: Theme.of(context).textTheme.headlineSmall,
                        ),
                      ),
                    ),
                    IconButton(
                      tooltip: 'Close menu',
                      onPressed: close,
                      icon: const Icon(Icons.close),
                    ),
                  ],
                ),
                const SizedBox(height: 12),
                destination(
                  'Profile',
                  Icons.person_outline,
                  () => _onTabTapped(2),
                ),
                destination(
                  'Rewards',
                  Icons.redeem_outlined,
                  () => _onTabTapped(3),
                ),
                destination(
                  'Notifications',
                  Icons.notifications_outlined,
                  () => _onTabTapped(5),
                ),
                destination(
                  'Trending',
                  Icons.trending_up,
                  () => _openFeedSection((feed) => feed.showTrending()),
                ),
                destination(
                  'Manage feeds',
                  Icons.tune,
                  () => _openFeedSection((feed) => feed.openFeedControls()),
                ),
                destination(
                  'Create feed',
                  Icons.add,
                  () => _openFeedSection((feed) => feed.createFeed()),
                ),
                destination(
                  'Refresh feed',
                  Icons.refresh,
                  () => _openFeedSection((feed) => feed.refreshFeed()),
                ),
                destination(
                  'Review and appeals',
                  Icons.fact_check_outlined,
                  () => _openFeedSection((feed) => feed.showAppeals()),
                ),
                if (signedIn) const OwnSubmissionsMenu(),
                const Divider(height: 32),
                destination('Settings', Icons.settings_outlined, _openSettings),
                destination('Help', Icons.help_outline, _openHelp),
                const SizedBox(height: 24),
                Semantics(
                  header: true,
                  child: Text(
                    'Appearance',
                    style: Theme.of(context).textTheme.titleSmall,
                  ),
                ),
                const SizedBox(height: 8),
                RadioGroup<ThemeMode>(
                  groupValue: ref.watch(themeModeProvider),
                  onChanged: (value) async {
                    if (value == null) return;
                    final persistence = ref
                        .read(themeModeProvider.notifier)
                        .setThemeMode(value);
                    final focus = _appearanceFocus[value]!;
                    // Commit an unfocused semantics frame before refocusing.
                    // Web semantics caches focus requests; requesting an
                    // already-focused radio after a theme rebuild can leave
                    // native focus on BODY and strand Tab/Escape at the root.
                    focus.unfocus();
                    FocusManager.instance.applyFocusChangesIfNeeded();
                    await WidgetsBinding.instance.endOfFrame;
                    if (mounted &&
                        _menuOpen &&
                        ModalRoute.of(context)?.isCurrent == true &&
                        ref.read(themeModeProvider) == value &&
                        focus.context != null &&
                        focus.canRequestFocus) {
                      focus.requestFocus();
                    }
                    final saved = await persistence;
                    if (!saved && mounted) {
                      ScaffoldMessenger.of(context).showSnackBar(
                        const SnackBar(
                          content: Text(
                            'Appearance changed for this session. It could not be saved.',
                          ),
                        ),
                      );
                    }
                  },
                  child: Column(
                    children: [
                      for (final mode in ThemeMode.values)
                        RadioListTile<ThemeMode>(
                          focusNode: _appearanceFocus[mode],
                          contentPadding: EdgeInsets.zero,
                          title: Text(switch (mode) {
                            ThemeMode.system => 'System',
                            ThemeMode.light => 'Light',
                            ThemeMode.dark => 'Dark',
                          }),
                          value: mode,
                        ),
                    ],
                  ),
                ),
                const SizedBox(height: 16),
                const Text(
                  'Choose a feed at the top, or swipe across its posts. '
                  'Menu is also available with an inward swipe near the right edge.',
                ),
              ],
            ),
          );
        },
      ),
    ),
  );

  Widget _feedNavigation() {
    final custom = ref
        .watch(feedListProvider)
        .where((feed) => feed.type == FeedType.custom)
        .toList();
    return FeedNavigationRail(
      ids: ['discover', 'news', ...custom.map((feed) => feed.id)],
      labels: ['Discovery', 'News', ...custom.map((feed) => feed.name)],
      selectedId: _activeFeedId,
      selectedFocusNode: _feedFocus,
      onSelect: (id) {
        final controls = id == _activeFeedId && _currentIndex == 0;
        _openFeedSection((feed) {
          if (controls) {
            feed.openFeedControls();
          } else {
            feed.selectFeed(id);
          }
        });
      },
    );
  }

  void _openSettings() {
    ++_navigationEpoch;
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
    ++_navigationEpoch;
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
        showNavigation: false,
        feedControlsFocusNode: _feedFocus,
        onFeedChanged: (id) {
          if (_activeFeedId != id) setState(() => _activeFeedId = id);
        },
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
    return CallbackShortcuts(
      bindings: {
        if (_menuOpen)
          const SingleActivator(LogicalKeyboardKey.escape): () =>
              _scaffoldKey.currentState?.closeEndDrawer(),
      },
      child: PopScope(
        canPop: _menuOpen || (_history.isEmpty && _currentIndex == 0),
        onPopInvokedWithResult: (didPop, _) {
          // The active composer owns draft persistence and in-flight submission
          // guards. A blocked route pop notifies both scopes; do not navigate
          // away before the composer's close handler resolves that decision.
          if (!didPop &&
              !_menuOpen &&
              !(_currentIndex == 1 && ref.read(currentUserProvider) != null)) {
            _returnToPrevious();
          }
        },
        child: Scaffold(
          key: _scaffoldKey,
          endDrawer: _accountDrawer(currentUser != null),
          endDrawerEnableOpenDragGesture: false,
          onEndDrawerChanged: (open) {
            setState(() => _menuOpen = open);
            if (!open) _menuFocus.requestFocus();
          },
          body: FeedSwipeRegion(
            onOpenMenu: _menuOpen || !ref.watch(horizontalSwipeEnabledProvider)
                ? null
                : _openMenu,
            child: SafeArea(
              bottom: false,
              child: Column(
                children: [
                  Center(
                    child: ConstrainedBox(
                      constraints: const BoxConstraints(maxWidth: 992),
                      child: SizedBox(
                        width: double.infinity,
                        child: Padding(
                          padding: const EdgeInsets.fromLTRB(24, 12, 24, 4),
                          child: Align(
                            alignment: Alignment.centerLeft,
                            child:
                                widget.brand ??
                                const LythBrand(
                                  variant: LythBrandVariant.wordmark,
                                  height: 32,
                                ),
                          ),
                        ),
                      ),
                    ),
                  ),
                  Center(
                    child: ConstrainedBox(
                      constraints: const BoxConstraints(maxWidth: 992),
                      child: _feedNavigation(),
                    ),
                  ),
                  if (_currentIndex != 0)
                    Center(
                      child: ConstrainedBox(
                        constraints: const BoxConstraints(maxWidth: 992),
                        child: Align(
                          alignment: Alignment.centerLeft,
                          child: TextButton.icon(
                            onPressed: () {
                              if (_currentIndex == 1 && currentUser != null) {
                                Navigator.of(context).maybePop();
                              } else {
                                _returnToPrevious();
                              }
                            },
                            icon: const Icon(Icons.arrow_back),
                            label: Text(
                              'Back to ${switch (_history.lastOrNull ?? 0) {
                                1 => 'draft',
                                2 => 'profile',
                                3 => 'rewards',
                                4 => 'search',
                                5 => 'notifications',
                                _ => 'feed',
                              }}',
                            ),
                          ),
                        ),
                      ),
                    ),
                  Expanded(child: content),
                ],
              ),
            ),
          ),
          bottomNavigationBar: MediaQuery.viewInsetsOf(context).bottom > 0
              ? null
              : EditorialActionBar(
                  onCreate: () => _onTabTapped(1),
                  onSearch: () => _onTabTapped(4),
                  onMenu: _openMenu,
                  menuFocusNode: _menuFocus,
                  leftHanded: ref.watch(leftHandedModeProvider),
                ),
        ),
      ),
    );
  }
}
