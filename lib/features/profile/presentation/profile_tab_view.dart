// ignore_for_file: public_member_api_docs

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter/services.dart';
import 'package:go_router/go_router.dart';
import 'package:lythaus/state/providers/settings_providers.dart';

class ProfileTabView extends ConsumerStatefulWidget {
  const ProfileTabView({
    super.key,
    required this.overview,
    required this.posts,
    required this.comments,
  });

  final Widget overview;
  final Widget posts;
  final Widget comments;

  @override
  ConsumerState<ProfileTabView> createState() => _ProfileTabViewState();
}

class _ProfileTabViewState extends ConsumerState<ProfileTabView>
    with TickerProviderStateMixin {
  static const _tabs = ['overview', 'posts', 'comments'];
  static const _tabLabels = ['Overview', 'Posts', 'Comments'];
  static const _panelIdentifiers = [
    'profile-overview-panel',
    'profile-posts-panel',
    'profile-comments-panel',
  ];
  late final List<GlobalKey> _tabKeys = List.generate(
    _tabs.length,
    (index) => GlobalKey(debugLabel: 'profile-tab-$index'),
  );
  late TabController _controller;
  bool _controllerInitialized = false;
  bool _reducedMotion = false;
  bool _syncingRoute = false;
  int _focusedTabIndex = 0;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final reducedMotion = MediaQuery.disableAnimationsOf(context);
    if (!_controllerInitialized || reducedMotion != _reducedMotion) {
      final index = _controllerInitialized ? _controller.index : 0;
      if (_controllerInitialized) {
        _controller.removeListener(_onTabChanged);
        _controller.dispose();
      }
      _reducedMotion = reducedMotion;
      _controller = TabController(
        length: _tabs.length,
        vsync: this,
        initialIndex: index,
        animationDuration: reducedMotion
            ? Duration.zero
            : const Duration(milliseconds: 300),
      );
      _controller.addListener(_onTabChanged);
      _controllerInitialized = true;
    }
    if (GoRouter.maybeOf(context) == null) return;
    final selected = GoRouterState.of(
      context,
    ).uri.queryParameters['profileTab'];
    final index = _tabs.indexOf(selected ?? 'overview');
    _syncingRoute = true;
    _controller.index = index < 0 ? 0 : index;
    _focusedTabIndex = _controller.index;
    _syncingRoute = false;
  }

  KeyEventResult _handleTabKeyEvent(FocusNode node, KeyEvent event) {
    if (event is! KeyDownEvent && event is! KeyRepeatEvent) {
      return KeyEventResult.ignored;
    }
    final keyboard = HardwareKeyboard.instance;
    if (keyboard.isAltPressed ||
        keyboard.isControlPressed ||
        keyboard.isMetaPressed ||
        keyboard.isShiftPressed) {
      return KeyEventResult.ignored;
    }
    final direction = Directionality.of(context);
    final previous = direction == TextDirection.ltr ? -1 : 1;
    final next = -previous;
    final targetIndex = switch (event.logicalKey) {
      LogicalKeyboardKey.arrowLeft =>
        (_focusedTabIndex + previous + _tabs.length) % _tabs.length,
      LogicalKeyboardKey.arrowRight => (_focusedTabIndex + next) % _tabs.length,
      LogicalKeyboardKey.home => 0,
      LogicalKeyboardKey.end => _tabs.length - 1,
      _ => null,
    };
    if (targetIndex == null) return KeyEventResult.ignored;

    final tabContext = _tabKeys[targetIndex].currentContext;
    if (tabContext != null) {
      Focus.maybeOf(tabContext, createDependency: false)?.requestFocus();
    }
    _focusedTabIndex = targetIndex;
    if (_controller.index != targetIndex) _controller.animateTo(targetIndex);
    return KeyEventResult.handled;
  }

  void _onTabFocusChange(bool focused, int index) {
    if (focused) _focusedTabIndex = index;
  }

  void _onTabChanged() {
    if (_syncingRoute || _controller.indexIsChanging) return;
    final router = GoRouter.maybeOf(context);
    if (router == null) return;
    final uri = GoRouterState.of(context).uri;
    final selected = _tabs[_controller.index];
    if ((uri.queryParameters['profileTab'] ?? 'overview') == selected) return;
    final location = uri
        .replace(
          queryParameters: {...uri.queryParameters, 'profileTab': selected},
        )
        .toString();
    if (router.routerDelegate.currentConfiguration.last
        is ImperativeRouteMatch) {
      router.replace<void>(location);
    } else {
      // Keep direct routes declarative so their path remains in the URL.
      router.go(location);
    }
  }

  @override
  void dispose() {
    _controller.removeListener(_onTabChanged);
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return FocusTraversalGroup(
      child: Column(
        children: [
          LayoutBuilder(
            builder: (context, constraints) {
              final scrollable =
                  constraints.maxWidth <
                  360 * MediaQuery.textScalerOf(context).scale(1);
              return Semantics(
                label: 'Profile sections',
                child: Focus(
                  canRequestFocus: false,
                  onKeyEvent: _handleTabKeyEvent,
                  child: TabBar(
                    controller: _controller,
                    onFocusChange: _onTabFocusChange,
                    isScrollable: scrollable,
                    tabAlignment: scrollable
                        ? TabAlignment.start
                        : TabAlignment.fill,
                    indicatorSize: TabBarIndicatorSize.tab,
                    tabs: [
                      for (var index = 0; index < _tabs.length; index++)
                        Semantics(
                          identifier: 'profile-${_tabs[index]}-tab',
                          child: Tab(
                            key: _tabKeys[index],
                            text: _tabLabels[index],
                          ),
                        ),
                    ],
                  ),
                ),
              );
            },
          ),
          Expanded(
            child: TabBarView(
              controller: _controller,
              physics: ref.watch(horizontalSwipeEnabledProvider)
                  ? null
                  : const NeverScrollableScrollPhysics(),
              children: [
                for (var index = 0; index < _tabs.length; index++)
                  Semantics(
                    identifier: _panelIdentifiers[index],
                    label: _tabLabels[index],
                    child: _PersistentProfileTab(
                      child: [
                        widget.overview,
                        widget.posts,
                        widget.comments,
                      ][index],
                    ),
                  ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _PersistentProfileTab extends StatefulWidget {
  const _PersistentProfileTab({required this.child});

  final Widget child;

  @override
  State<_PersistentProfileTab> createState() => _PersistentProfileTabState();
}

class _PersistentProfileTabState extends State<_PersistentProfileTab>
    with AutomaticKeepAliveClientMixin {
  @override
  bool get wantKeepAlive => true;

  @override
  Widget build(BuildContext context) {
    super.build(context);
    return widget.child;
  }
}
