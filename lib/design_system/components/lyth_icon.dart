// ignore_for_file: public_member_api_docs

/// Lythaus Icon Component
///
/// Semantic wrapper for icons with consistent sizing and coloring.
library;

import 'package:flutter/material.dart';

import 'package:lythaus/design_system/theme/theme_build_context_x.dart';

/// Icon size variants
enum LythIconSize {
  small(16),
  medium(24),
  large(32),
  xlarge(48);

  final double size;

  const LythIconSize(this.size);
}

/// Semantic icon component
///
/// Provides consistent icon sizing and coloring throughout the app.
/// All semantic values come from the design system.
///
/// Usage:
/// ```dart
/// LythIcon(Icons.settings)
///
/// LythIcon(
///   Icons.favorite,
///   size: LythIconSize.large,
///   color: context.colorScheme.error,
/// )
/// ```
class LythIcon extends StatelessWidget {
  /// The icon data
  final IconData icon;

  /// Icon size
  final LythIconSize size;

  /// Icon color
  final Color? color;

  /// Semantic color (alternative to color)
  /// 'primary', 'error', 'success', 'warning', 'muted'
  final String? semanticColor;

  const LythIcon(
    this.icon, {
    this.size = LythIconSize.medium,
    this.color,
    this.semanticColor,
    super.key,
  });

  /// Create a primary-colored icon
  const LythIcon.primary(
    this.icon, {
    this.size = LythIconSize.medium,
    super.key,
  }) : color = null,
       semanticColor = 'primary';

  /// Create an error-colored icon
  const LythIcon.error(this.icon, {this.size = LythIconSize.medium, super.key})
    : color = null,
      semanticColor = 'error';

  /// Create a muted (disabled-looking) icon
  const LythIcon.muted(this.icon, {this.size = LythIconSize.medium, super.key})
    : color = null,
      semanticColor = 'muted';

  Color _resolveColor(BuildContext context) {
    if (color != null) return color!;

    return switch (semanticColor) {
      'primary' => context.colorScheme.primary,
      'error' => context.colorScheme.error,
      'muted' => context.colorScheme.onSurface.withValues(alpha: 0.4),
      _ => context.colorScheme.onSurface,
    };
  }

  @override
  Widget build(BuildContext context) {
    return Icon(icon, size: size.size, color: _resolveColor(context));
  }
}
