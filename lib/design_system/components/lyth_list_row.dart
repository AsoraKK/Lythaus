// ignore_for_file: public_member_api_docs

/// Lythaus List Row Component
///
/// Container for list items with consistent spacing and interactions.
library;

import 'package:flutter/material.dart';

import 'package:lythaus/design_system/theme/theme_build_context_x.dart';

/// Semantic list row component
///
/// High-level container for list items with title, subtitle, icons, and trailing widget.
/// Provides consistent spacing and interactive states.
///
/// Usage:
/// ```dart
/// LythListRow(
///   title: 'Settings',
///   subtitle: 'Manage your preferences',
///   leadingIcon: Icons.settings,
///   onTap: () {},
/// )
///
/// LythListRow(
///   title: 'John Doe',
///   subtitle: '@johndoe',
///   leadingIcon: Icons.person,
///   trailingIcon: Icons.arrow_forward_ios,
///   onTap: _openProfile,
/// )
/// ```
class LythListRow extends StatelessWidget {
  /// Primary text (required)
  final String title;

  /// Secondary text (optional)
  final String? subtitle;

  /// Leading icon (left side)
  final IconData? leadingIcon;

  /// Trailing widget (right side)
  final Widget? trailing;

  /// Trailing icon (right side, alternative to trailing)
  final IconData? trailingIcon;

  /// Callback when row is tapped
  final VoidCallback? onTap;

  /// Callback when row is long-pressed
  final VoidCallback? onLongPress;

  /// Custom height
  final double? height;

  /// Custom padding
  final EdgeInsets? padding;

  /// Whether row is selected
  final bool selected;

  const LythListRow({
    required this.title,
    this.subtitle,
    this.leadingIcon,
    this.trailing,
    this.trailingIcon,
    this.onTap,
    this.onLongPress,
    this.height,
    this.padding,
    this.selected = false,
    super.key,
  });

  @override
  Widget build(BuildContext context) {
    final padding =
        this.padding ??
        EdgeInsets.symmetric(
          horizontal: context.spacing.lg.toDouble(),
          vertical: context.spacing.md.toDouble(),
        );

    final height = this.height ?? 60;

    final Widget content = Row(
      children: [
        // Leading icon
        if (leadingIcon != null)
          Padding(
            padding: EdgeInsets.only(right: context.spacing.md.toDouble()),
            child: Icon(
              leadingIcon,
              color: context.colorScheme.onSurface,
              size: 24,
            ),
          ),

        // Title and subtitle
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Text(
                title,
                style: context.textTheme.bodyLarge?.copyWith(
                  color: context.colorScheme.onSurface,
                ),
                overflow: TextOverflow.ellipsis,
              ),
              if (subtitle != null) ...[
                SizedBox(height: context.spacing.xs.toDouble()),
                Text(
                  subtitle!,
                  style: context.textTheme.bodySmall?.copyWith(
                    color: context.colorScheme.onSurface.withValues(alpha: 0.6),
                  ),
                  overflow: TextOverflow.ellipsis,
                ),
              ],
            ],
          ),
        ),

        // Trailing widget or icon
        if (trailing != null)
          Padding(
            padding: EdgeInsets.only(left: context.spacing.md.toDouble()),
            child: trailing,
          )
        else if (trailingIcon != null)
          Padding(
            padding: EdgeInsets.only(left: context.spacing.md.toDouble()),
            child: Icon(
              trailingIcon,
              color: context.colorScheme.onSurface.withValues(alpha: 0.6),
              size: 20,
            ),
          ),
      ],
    );

    return Container(
      height: height,
      padding: padding,
      decoration: BoxDecoration(
        color: selected
            ? context.colorScheme.primary.withValues(alpha: 0.1)
            : Colors.transparent,
        border: Border(
          bottom: BorderSide(
            color: context.colorScheme.outline.withValues(alpha: 0.1),
            width: 1,
          ),
        ),
      ),
      child: Material(
        color: Colors.transparent,
        child: InkWell(onTap: onTap, onLongPress: onLongPress, child: content),
      ),
    );
  }
}
