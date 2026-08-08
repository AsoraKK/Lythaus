import 'package:flutter/material.dart';

import 'package:lythaus/features/auth/presentation/invite_redeem_screen.dart';
import 'package:lythaus/features/feed/presentation/post_detail_screen.dart';
import 'package:lythaus/features/moderation/presentation/moderation_console/moderation_console_screen.dart';
import 'package:lythaus/features/moderation/presentation/screens/appeal_history_screen.dart';
import 'package:lythaus/ui/screens/profile/profile_screen.dart';
import 'package:lythaus/features/notifications/presentation/notifications_settings_screen.dart';

/// Deep-link router for handling notification navigation
/// Parses deep-link URIs and navigates to appropriate screens
class DeeplinkRouter {
  /// Parse and navigate to deep-linked content
  /// Supported formats:
  /// - https://app.lythaus.co/post/{postId} - Navigate to post detail
  /// - https://app.lythaus.co/user/{userId} - Navigate to user profile
  /// - https://app.lythaus.co/invite/{code} - Navigate to invite redemption
  /// - lythaus://post/{postId} - Native-scheme compatibility
  static Future<void> navigate(BuildContext context, String deeplink) async {
    final uri = Uri.tryParse(deeplink);
    if (uri == null) {
      debugPrint('[DeepLink] Invalid deeplink: $deeplink');
      return;
    }
    final parsed = _normalize(uri);
    if (parsed == null) {
      debugPrint('[DeepLink] Invalid deeplink: $deeplink');
      return;
    }

    final type = parsed.type;
    final id = parsed.id;

    switch (type) {
      case 'post':
        if (id != null) {
          final commentId =
              parsed.query['commentId'] ?? parsed.query['comment'];
          await _navigateToPost(context, id, initialCommentId: commentId);
        }
        break;
      case 'user':
        if (id != null) {
          await _navigateToProfile(context, id);
        }
        break;
      case 'comment':
        if (id != null) {
          await _navigateToComment(context, id, parsed);
        }
        break;
      case 'settings':
        if (id == 'notifications') {
          await _navigateToNotificationSettings(context);
        }
        break;
      case 'moderation':
        await _navigateToModeration(context, parsed);
        break;
      case 'invite':
        await _navigateToInvite(context, id, parsed.query['code']);
        break;
      default:
        debugPrint('[DeepLink] Unknown deeplink type: $type');
    }
  }

  static Future<void> _navigateToPost(
    BuildContext context,
    String postId, {
    String? initialCommentId,
  }) async {
    await Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => PostDetailScreen(
          postId: postId,
          initialCommentId: initialCommentId,
        ),
      ),
    );
  }

  static Future<void> _navigateToProfile(
    BuildContext context,
    String userId,
  ) async {
    await Navigator.of(
      context,
    ).push(MaterialPageRoute<void>(builder: (_) => const ProfileScreen()));
  }

  static Future<void> _navigateToComment(
    BuildContext context,
    String commentId,
    _NormalizedDeepLink parsed,
  ) async {
    final postId =
        parsed.query['postId'] ??
        parsed.query['post'] ??
        (parsed.remainingPathSegments.isNotEmpty
            ? parsed.remainingPathSegments.first
            : null);
    if (postId == null || postId.isEmpty) {
      debugPrint(
        '[DeepLink] Missing postId for comment deep-link: comment=$commentId',
      );
      return;
    }
    await _navigateToPost(context, postId, initialCommentId: commentId);
  }

  static Future<void> _navigateToModeration(
    BuildContext context,
    _NormalizedDeepLink parsed,
  ) async {
    final subtype = parsed.id;
    if (subtype == 'appeal') {
      await Navigator.of(context).push(
        MaterialPageRoute<void>(builder: (_) => const AppealHistoryScreen()),
      );
      return;
    }

    await Navigator.of(context).push(
      MaterialPageRoute<void>(builder: (_) => const ModerationConsoleScreen()),
    );
  }

  static Future<void> _navigateToNotificationSettings(
    BuildContext context,
  ) async {
    await Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => const NotificationsSettingsScreen(),
      ),
    );
  }

  static Future<void> _navigateToInvite(
    BuildContext context,
    String? codeFromPath,
    String? codeFromQuery,
  ) async {
    final code = codeFromPath ?? codeFromQuery;
    await Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => InviteRedeemScreen(inviteCode: code),
      ),
    );
  }

  /// Handle notification tap from system tray or in-app
  static Future<void> handleNotificationTap(
    BuildContext context,
    Map<String, dynamic> data,
  ) async {
    final deeplink = data['deeplink'] as String?;
    if (deeplink != null) {
      await navigate(context, deeplink);
    }
  }
}

class _NormalizedDeepLink {
  const _NormalizedDeepLink({
    required this.type,
    required this.id,
    required this.remainingPathSegments,
    required this.query,
  });

  final String type;
  final String? id;
  final List<String> remainingPathSegments;
  final Map<String, String> query;
}

_NormalizedDeepLink? _normalize(Uri uri) {
  if (uri.scheme == 'lythaus' || uri.scheme == 'lythaus') {
    final type = uri.host.trim();
    if (type.isEmpty) {
      return null;
    }
    final segments = uri.pathSegments.where((segment) => segment.isNotEmpty);
    final list = List<String>.from(segments);
    return _NormalizedDeepLink(
      type: type,
      id: list.isNotEmpty ? list.first : null,
      remainingPathSegments: list.length > 1 ? list.sublist(1) : const [],
      query: uri.queryParameters,
    );
  }

  final pathSegments = uri.pathSegments.where((segment) => segment.isNotEmpty);
  final list = List<String>.from(pathSegments);
  if (list.isEmpty) {
    return null;
  }
  return _NormalizedDeepLink(
    type: list.first,
    id: list.length > 1 ? list[1] : null,
    remainingPathSegments: list.length > 2 ? list.sublist(2) : const [],
    query: uri.queryParameters,
  );
}
