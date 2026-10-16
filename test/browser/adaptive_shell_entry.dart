import 'dart:convert';
import 'dart:js_interop';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:lythaus/core/analytics/analytics_client.dart';
import 'package:lythaus/core/analytics/analytics_providers.dart';
import 'package:lythaus/design_system/theme/lyth_theme.dart';
import 'package:lythaus/features/auth/application/auth_providers.dart';
import 'package:lythaus/features/auth/domain/user.dart';
import 'package:lythaus/features/feed/application/content_recovery_storage.dart';
import 'package:lythaus/features/feed/application/post_creation_providers.dart';
import 'package:lythaus/state/models/feed_models.dart';
import 'package:lythaus/state/providers/feed_providers.dart';
import 'package:lythaus/ui/screens/adaptive_shell.dart';

import '../helpers/content_recovery.dart';

final _member = StateProvider<bool>((_) => true);
final _shellKey = GlobalKey();

class _FixtureAuth extends StateNotifier<AsyncValue<User?>>
    implements AuthStateNotifier {
  _FixtureAuth(User? user) : super(AsyncValue.data(user));

  @override
  dynamic noSuchMethod(Invocation invocation) =>
      throw UnsupportedError('Synthetic navigation auth is read-only');
}

@JS('lythausNavigationSnapshot')
external set _snapshot(JSFunction callback);

@JS('lythausNavigationSignOut')
external set _signOut(JSFunction callback);

class _EmptyFeed extends LiveFeedController {
  _EmptyFeed() : super(const LiveFeedState(isInitialLoading: false));

  @override
  Future<void> refresh() async {}

  @override
  Future<void> loadMore() async {}
}

void main() {
  GoogleFonts.config.allowRuntimeFetching = false;
  runApp(
    ProviderScope(
      overrides: [
        currentUserProvider.overrideWith(
          (ref) => ref.watch(_member)
              ? User(
                  id: '018f0000-0000-7000-8000-000000000001',
                  email: 'synthetic@example.invalid',
                  role: UserRole.user,
                  tier: UserTier.bronze,
                  reputationScore: 0,
                  createdAt: DateTime.utc(2026, 10, 15),
                  lastLoginAt: DateTime.utc(2026, 10, 15),
                )
              : null,
        ),
        canCreatePostProvider.overrideWith((ref) => ref.watch(_member)),
        authStateProvider.overrideWith(
          (ref) => _FixtureAuth(ref.watch(currentUserProvider)),
        ),
        guestModeProvider.overrideWith((ref) => !ref.watch(_member)),
        jwtProvider.overrideWith((ref) async => null),
        contentRecoveryStorageProvider.overrideWithValue(
          MemoryContentRecoveryStorage(),
        ),
        analyticsClientProvider.overrideWithValue(const NullAnalyticsClient()),
        feedListProvider.overrideWithValue(const [
          FeedModel(
            id: 'discover',
            name: 'Discover',
            type: FeedType.discover,
            contentFilters: ContentFilters(allowedTypes: {ContentType.mixed}),
            sorting: SortingRule.hot,
            refinements: FeedRefinements(),
            subscriptionLevelRequired: 0,
            isHome: true,
          ),
        ]),
        liveFeedStateProvider.overrideWith((ref, _) => _EmptyFeed()),
        liveFeedItemsProvider.overrideWith((ref, _) async => []),
      ],
      child: const _Fixture(),
    ),
  );
}

class _Fixture extends ConsumerWidget {
  const _Fixture();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    _signOut = (() => ref.read(_member.notifier).state = false).toJS;
    _snapshot = (() {
      final fields = <TextField>[];
      void visit(Element element) {
        if (element.widget case final TextField field) fields.add(field);
        element.visitChildren(visit);
      }

      final root = _shellKey.currentContext;
      if (root is Element) visit(root);
      return jsonEncode({
        'fields': fields.length,
        if (fields.isNotEmpty) ...{
          'controller': identityHashCode(fields.single.controller),
          'text': fields.single.controller!.text,
          'base': fields.single.controller!.selection.baseOffset,
          'extent': fields.single.controller!.selection.extentOffset,
          'focused': fields.single.focusNode!.hasFocus,
        },
      }).toJS;
    }).toJS;
    return MaterialApp(
      title: 'Lythaus navigation synthetic QA',
      debugShowCheckedModeBanner: false,
      theme: Uri.base.queryParameters['theme'] == 'dark'
          ? LythausTheme.dark()
          : LythausTheme.light(),
      builder: (context, child) => MediaQuery(
        data: MediaQuery.of(context).copyWith(
          textScaler: TextScaler.linear(
            double.tryParse(Uri.base.queryParameters['scale'] ?? '') ?? 1,
          ),
          disableAnimations: true,
        ),
        child: child!,
      ),
      home: AdaptiveShell(key: _shellKey, initialIndex: 1),
    );
  }
}
