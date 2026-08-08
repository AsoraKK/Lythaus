// ignore_for_file: public_member_api_docs

/// Lythaus Empty State Component
///
/// Container for displaying empty state screens.
library;

import 'package:flutter/material.dart';

import 'package:lythaus/design_system/theme/theme_build_context_x.dart';

/// Semantic empty state component
///
/// Provides a consistent layout for empty state screens
/// (no results, no items, etc.) with icon, title, and optional action button.
///
/// Usage:
/// ```dart
/// LythEmptyState(
///   icon: Icons.inbox,
///   title: 'No Messages',
///   subtitle: 'You have no new messages',
/// )
///
/// LythEmptyState(
///   icon: Icons.search,
///   title: 'No Results',
///   subtitle: 'Try a different search term',
///   actionLabel: 'Clear Search',
///   onAction: () => _clearSearch(),
/// )
/// ```
class LythEmptyState extends StatelessWidget {
  /// Icon to display
  final IconData icon;

  /// Title text
  final String title;

  /// Subtitle text (optional)
  final String? subtitle;

  /// Action button label (optional)
  final String? actionLabel;

  /// Callback for action button
  final VoidCallback? onAction;

  /// Icon size (default 64)
  final double iconSize;

  /// Custom icon color
  final Color? iconColor;

  const LythEmptyState({
    required this.icon,
    required this.title,
    this.subtitle,
    this.actionLabel,
    this.onAction,
    this.iconSize = 64,
    this.iconColor,
    super.key,
  });

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: EdgeInsets.all(context.spacing.lg.toDouble()),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            // Icon
            Icon(
              icon,
              size: iconSize,
              color:
                  iconColor ??
                  context.colorScheme.outline.withValues(alpha: 0.5),
            ),

            SizedBox(height: context.spacing.lg.toDouble()),

            // Title
            Text(
              title,
              style: context.textTheme.headlineSmall?.copyWith(
                color: context.colorScheme.onSurface,
              ),
              textAlign: TextAlign.center,
            ),

            // Subtitle
            if (subtitle != null) ...[
              SizedBox(height: context.spacing.sm.toDouble()),
              Text(
                subtitle!,
                style: context.textTheme.bodyMedium?.copyWith(
                  color: context.colorScheme.onSurface.withValues(alpha: 0.6),
                ),
                textAlign: TextAlign.center,
              ),
            ],

            // Action button
            if (actionLabel != null && onAction != null) ...[
              SizedBox(height: context.spacing.lg.toDouble()),
              ElevatedButton(onPressed: onAction, child: Text(actionLabel!)),
            ],
          ],
        ),
      ),
    );
  }
}
