// ignore_for_file: public_member_api_docs

import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import 'package:lythaus/features/auth/application/auth_providers.dart';
import 'package:lythaus/features/auth/domain/user.dart';
import 'package:lythaus/features/auth/presentation/auth_choice_screen.dart';
import 'package:lythaus/features/auth/presentation/invite_redeem_screen.dart';
import 'package:lythaus/features/feed/presentation/post_detail_screen.dart';
import 'package:lythaus/features/moderation/presentation/moderation_console/moderation_console_screen.dart';
import 'package:lythaus/features/moderation/presentation/screens/appeal_history_screen.dart';
import 'package:lythaus/features/notifications/presentation/notifications_settings_screen.dart';
import 'package:lythaus/ui/screens/adaptive_shell.dart';
import 'package:lythaus/ui/screens/profile/profile_screen.dart';
import 'package:lythaus/ui/screens/profile/settings_screen.dart';
import 'package:lythaus/ui/components/reading_pane.dart';
import 'package:lythaus/features/authenticity/beta_screen.dart';
import 'package:lythaus/features/authenticity/alpha_screen.dart';

/// Route name constants.
abstract final class AppRoutes {
  static const String login = 'login';
  static const String shell = 'shell';
  static const String post = 'post';
  static const String profile = 'profile';
  static const String invite = 'invite';
  static const String moderation = 'moderation';
  static const String moderationAppeal = 'moderation-appeal';
  static const String notificationSettings = 'notification-settings';
  static const String rewards = 'rewards';
  static const String settings = 'settings';
}

String? resolveAppRedirect({
  required String matchedLocation,
  required User? user,
  required bool isGuest,
  String? pendingCode,
}) {
  final isLoggedIn = user != null || isGuest;
  final isOnLogin = matchedLocation == '/login';
  final isOnInvite = matchedLocation.startsWith('/invite/');
  final isOnStaffModeration = matchedLocation == '/moderation';
  final canReviewModeration =
      user?.role == UserRole.moderator || user?.role == UserRole.admin;

  if (isOnInvite) {
    return null;
  }
  if (isLoggedIn && pendingCode != null && pendingCode.isNotEmpty) {
    return '/invite/$pendingCode';
  }
  if (!isLoggedIn && !isOnLogin) return '/login';
  if (isLoggedIn && isOnLogin) return '/';
  if (isOnStaffModeration && !canReviewModeration) return '/';
  return null;
}

/// Provides the application [GoRouter] that is refreshed when auth state
/// changes. Stage A: top-level routes wrapping existing screen widgets.
final appRouterProvider = Provider<GoRouter>((ref) {
  final refresh = ValueNotifier<int>(0);
  ref.listen(authStateProvider, (_, _) => refresh.value += 1);
  ref.listen(guestModeProvider, (_, _) => refresh.value += 1);
  ref.listen(pendingInviteCodeProvider, (_, _) => refresh.value += 1);
  final router = GoRouter(
    debugLogDiagnostics: false,
    initialLocation: '/',
    refreshListenable: refresh,
    redirect: (context, state) {
      return resolveAppRedirect(
        matchedLocation: state.matchedLocation,
        user: ref.read(authStateProvider).valueOrNull,
        isGuest: ref.read(guestModeProvider),
        pendingCode: ref.read(pendingInviteCodeProvider),
      );
    },
    routes: [
      // Login / auth choice
      GoRoute(
        name: AppRoutes.login,
        path: '/login',
        builder: (context, state) =>
            const ReadingPane(child: AuthChoiceScreen()),
      ),

      // Invite redemption — top-level public route so anonymous users can
      // open deep-links and the invite code is never lost by an auth wall.
      GoRoute(
        name: AppRoutes.invite,
        path: '/invite/:code',
        builder: (context, state) =>
            InviteRedeemScreen(inviteCode: state.pathParameters['code']),
      ),

      // Alpha app shell (tabs: Discover, Create, Profile, Rewards)
      GoRoute(
        name: AppRoutes.rewards,
        path: '/rewards',
        redirect: (context, state) => Uri(
          path: '/',
          queryParameters: {...state.uri.queryParameters, 'tab': 'rewards'},
        ).toString(),
      ),
      GoRoute(
        name: AppRoutes.settings,
        path: '/settings',
        builder: (context, state) => const ReadingPane(child: SettingsScreen()),
      ),
      GoRoute(
        path: '/authenticity',
        builder: (context, state) => const AuthenticityPrivateAlphaScreen(),
      ),
      GoRoute(
        path: '/authenticity-beta',
        builder: (context, state) => const AuthenticityBetaScreen(),
      ),
      GoRoute(
        name: AppRoutes.shell,
        path: '/',
        builder: (context, state) => AdaptiveShell(
          initialIndex: switch (state.uri.queryParameters['tab']) {
            'create' => ref.read(guestModeProvider) ? 0 : 1,
            'profile' => 2,
            'rewards' => 3,
            _ => 0,
          },
        ),
        routes: [
          // Post detail
          GoRoute(
            name: AppRoutes.post,
            path: 'post/:postId',
            builder: (context, state) => PostDetailScreen(
              postId: state.pathParameters['postId']!,
              initialCommentId: state.uri.queryParameters['commentId'],
            ),
          ),

          // User profile
          GoRoute(
            name: AppRoutes.profile,
            path: 'user/:userId',
            builder: (context, state) =>
                ProfileScreen(userId: state.pathParameters['userId']),
          ),

          // Moderation
          GoRoute(
            name: AppRoutes.moderation,
            path: 'moderation',
            builder: (context, state) => const ModerationConsoleScreen(),
            routes: [
              GoRoute(
                name: AppRoutes.moderationAppeal,
                path: 'appeal',
                builder: (context, state) => const AppealHistoryScreen(),
              ),
            ],
          ),

          // Notification settings
          GoRoute(
            name: AppRoutes.notificationSettings,
            path: 'settings/notifications',
            builder: (context, state) => const NotificationsSettingsScreen(),
          ),
        ],
      ),
    ],
  );
  ref.onDispose(() {
    router.dispose();
    refresh.dispose();
  });
  return router;
});
