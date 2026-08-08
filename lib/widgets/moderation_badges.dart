// ignore_for_file: public_member_api_docs

import 'package:flutter/material.dart';

import 'package:lythaus/design_system/components/lyth_button.dart';
import 'package:lythaus/design_system/components/lyth_icon_button.dart';
import 'package:lythaus/design_system/theme/theme_build_context_x.dart';
import 'package:lythaus/features/moderation/domain/appeal.dart';

/// LYTHAUS MODERATION BADGES
///
/// 🎯 Purpose: Display moderation status and appeal state on content
/// ✅ Features: Flagged warnings, appeal status
/// 🎨 Design: Subtle badges with color coding and icons
/// 🔒 Privacy: No public AI score display

class ModerationBadges extends StatelessWidget {
  final ModerationStatus status;
  final String? appealStatus;
  final VoidCallback? onAppeal;
  final bool isOwnContent;

  const ModerationBadges({
    super.key,
    required this.status,
    this.appealStatus,
    this.onAppeal,
    this.isOwnContent = false,
  });

  @override
  Widget build(BuildContext context) {
    final badges = <Widget>[];

    // Main moderation status badge
    final statusBadge = _buildStatusBadge(context);
    if (statusBadge != null) {
      badges.add(statusBadge);
    }

    // Appeal status badge (for own content)
    if (isOwnContent && appealStatus != null) {
      badges.add(_buildAppealBadge(context));
    }

    if (badges.isEmpty) return const SizedBox.shrink();

    return Wrap(spacing: 8, runSpacing: 4, children: badges);
  }

  Widget? _buildStatusBadge(BuildContext context) {
    final scheme = context.colorScheme;
    IconData? icon;
    Color? backgroundColor;
    Color? textColor;
    String? text;

    switch (status) {
      case ModerationStatus.flagged:
        icon = Icons.flag;
        backgroundColor = scheme.primary.withValues(alpha: 0.2);
        textColor = scheme.onSurface;
        text = 'Flagged';
        break;

      case ModerationStatus.hidden:
        icon = Icons.visibility_off;
        backgroundColor = scheme.error.withValues(alpha: 0.14);
        textColor = scheme.error;
        text = 'Blocked';
        break;

      case ModerationStatus.communityApproved:
        icon = Icons.check_circle;
        backgroundColor = scheme.primary.withValues(alpha: 0.2);
        textColor = scheme.onSurface;
        text = 'Community Approved';
        break;

      case ModerationStatus.communityRejected:
        icon = Icons.cancel;
        backgroundColor = scheme.error.withValues(alpha: 0.14);
        textColor = scheme.error;
        text = 'Community Rejected';
        break;

      case ModerationStatus.clean:
        // No badge for clean content
        return null;
    }

    return _Badge(
      icon: icon,
      text: text,
      backgroundColor: backgroundColor,
      textColor: textColor,
    );
  }

  Widget _buildAppealBadge(BuildContext context) {
    final scheme = context.colorScheme;
    IconData icon;
    Color backgroundColor;
    Color textColor;
    String text;

    final normalized = appealStatus?.toLowerCase();
    switch (normalized) {
      case 'pending':
      case 'under_review':
      case 'underreview':
        icon = Icons.schedule;
        backgroundColor = scheme.surfaceContainerHigh;
        textColor = scheme.onSurface;
        text = 'Appeal Pending';
        break;

      case 'approved':
        icon = Icons.check_circle;
        backgroundColor = scheme.primary.withValues(alpha: 0.2);
        textColor = scheme.onSurface;
        text = 'Appeal Approved';
        break;

      case 'rejected':
        icon = Icons.cancel;
        backgroundColor = scheme.error.withValues(alpha: 0.14);
        textColor = scheme.error;
        text = 'Appeal Rejected';
        break;

      case 'expired':
        icon = Icons.access_time;
        backgroundColor = scheme.surfaceContainerHigh;
        textColor = scheme.onSurface;
        text = 'Appeal Expired';
        break;

      default:
        return const SizedBox.shrink();
    }

    return GestureDetector(
      onTap: onAppeal,
      child: _Badge(
        icon: icon,
        text: text,
        backgroundColor: backgroundColor,
        textColor: textColor,
        interactive: onAppeal != null,
      ),
    );
  }
}

/// Individual badge widget
class _Badge extends StatelessWidget {
  final IconData icon;
  final String text;
  final Color backgroundColor;
  final Color textColor;
  final bool interactive;

  const _Badge({
    required this.icon,
    required this.text,
    required this.backgroundColor,
    required this.textColor,
    this.interactive = false,
  });

  @override
  Widget build(BuildContext context) {
    final badge = Container(
      padding: EdgeInsets.symmetric(
        horizontal: context.spacing.sm,
        vertical: context.spacing.xs,
      ),
      decoration: BoxDecoration(
        color: backgroundColor,
        borderRadius: BorderRadius.circular(context.radius.sm),
        border: Border.all(color: textColor.withValues(alpha: 0.3), width: 1),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 14, color: textColor),
          SizedBox(width: context.spacing.xs),
          Text(
            text,
            style: context.textTheme.labelSmall?.copyWith(
              color: textColor,
              fontWeight: FontWeight.w600,
            ),
          ),
          if (interactive) ...[
            SizedBox(width: context.spacing.xs),
            Icon(Icons.arrow_forward_ios, size: 10, color: textColor),
          ],
        ],
      ),
    );

    if (interactive) {
      return Material(
        color: context.colorScheme.surface.withValues(alpha: 0),
        child: InkWell(
          borderRadius: BorderRadius.circular(context.radius.sm),
          child: badge,
        ),
      );
    }

    return badge;
  }
}

/// Helper widget for showing moderation info in a dismissible banner
class ModerationInfoBanner extends StatelessWidget {
  final ModerationStatus status;
  final String? message;
  final VoidCallback? onAppeal;
  final VoidCallback? onDismiss;

  const ModerationInfoBanner({
    super.key,
    required this.status,
    this.message,
    this.onAppeal,
    this.onDismiss,
  });

  @override
  Widget build(BuildContext context) {
    if (status == ModerationStatus.clean) {
      return const SizedBox.shrink();
    }

    final scheme = context.colorScheme;
    Color backgroundColor;
    Color textColor;
    IconData icon;
    String title;

    switch (status) {
      case ModerationStatus.flagged:
        backgroundColor = scheme.primary.withValues(alpha: 0.16);
        textColor = scheme.onSurface;
        icon = Icons.flag;
        title = 'Content Flagged';
        break;

      case ModerationStatus.hidden:
        backgroundColor = scheme.error.withValues(alpha: 0.12);
        textColor = scheme.error;
        icon = Icons.visibility_off;
        title = 'Content Blocked';
        break;

      case ModerationStatus.communityApproved:
        backgroundColor = scheme.primary.withValues(alpha: 0.16);
        textColor = scheme.onSurface;
        icon = Icons.check_circle;
        title = 'Community Approved';
        break;

      case ModerationStatus.communityRejected:
        backgroundColor = scheme.error.withValues(alpha: 0.12);
        textColor = scheme.error;
        icon = Icons.cancel;
        title = 'Community Rejected';
        break;

      case ModerationStatus.clean:
        return const SizedBox.shrink();
    }

    return Container(
      width: double.infinity,
      margin: EdgeInsets.all(context.spacing.sm),
      padding: EdgeInsets.all(context.spacing.lg),
      decoration: BoxDecoration(
        color: backgroundColor,
        borderRadius: BorderRadius.circular(context.radius.md),
        border: Border.all(color: textColor.withValues(alpha: 0.3)),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, color: textColor, size: 20),
          SizedBox(width: context.spacing.md),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: context.textTheme.titleSmall?.copyWith(
                    fontWeight: FontWeight.w700,
                    color: textColor,
                  ),
                ),
                if (message != null) ...[
                  SizedBox(height: context.spacing.xs),
                  Text(
                    message!,
                    style: context.textTheme.bodySmall?.copyWith(
                      color: textColor,
                    ),
                  ),
                ],
                if (onAppeal != null) ...[
                  SizedBox(height: context.spacing.sm),
                  LythButton.secondary(
                    onPressed: onAppeal,
                    icon: Icons.gavel,
                    label: 'Appeal decision',
                  ),
                ],
              ],
            ),
          ),
          if (onDismiss != null)
            LythIconButton(
              onPressed: onDismiss,
              icon: Icons.close,
              tooltip: 'Dismiss',
            ),
        ],
      ),
    );
  }
}
