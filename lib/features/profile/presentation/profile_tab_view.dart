// ignore_for_file: public_member_api_docs

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
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
  late TabController _controller;
  bool _controllerInitialized = false;
  bool _reducedMotion = false;
  bool _syncingRoute = false;

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
    _syncingRoute = false;
  }

  void _onTabChanged() {
    if (_syncingRoute || _controller.indexIsChanging) return;
    final router = GoRouter.maybeOf(context);
    if (router == null) return;
    final uri = GoRouterState.of(context).uri;
    final selected = _tabs[_controller.index];
    if ((uri.queryParameters['profileTab'] ?? 'overview') == selected) return;
    router.go(
      uri
          .replace(
            queryParameters: {...uri.queryParameters, 'profileTab': selected},
          )
          .toString(),
    );
  }

  @override
  void dispose() {
    _controller.removeListener(_onTabChanged);
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        TabBar(
          controller: _controller,
          isScrollable: true,
          tabAlignment: TabAlignment.start,
          tabs: const [
            Tab(text: 'Overview'),
            Tab(text: 'Posts'),
            Tab(text: 'Comments'),
          ],
        ),
        Expanded(
          child: TabBarView(
            controller: _controller,
            physics: ref.watch(horizontalSwipeEnabledProvider)
                ? null
                : const NeverScrollableScrollPhysics(),
            children: [widget.overview, widget.posts, widget.comments],
          ),
        ),
      ],
    );
  }
}
