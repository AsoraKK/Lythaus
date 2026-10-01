// ignore_for_file: public_member_api_docs

/// Lythaus Icon Button Component
///
/// Icon-only button for compact, semantically clear actions.
library;

import 'package:flutter/material.dart';

import 'package:lythaus/design_system/theme/theme_build_context_x.dart';

/// Semantic icon button component
///
/// Provides icon-only button with consistent sizing and styling.
/// All buttons have minimum 48x48 tap target for accessibility.
///
/// Usage:
/// ```dart
/// LythIconButton(
///   icon: Icons.close,
///   onPressed: () {},
/// )
///
/// LythIconButton(
///   icon: Icons.favorite,
///   onPressed: () {},
///   color: context.colorScheme.error,
/// )
/// ```
class LythIconButton extends StatelessWidget {
  final int _variant;

  /// The icon to display
  final IconData icon;

  /// Callback when pressed
  final VoidCallback? onPressed;

  /// Whether button is disabled
  final bool disabled;

  /// Custom icon color
  final Color? color;

  /// Tooltip for accessibility
  final String? tooltip;

  /// Icon size (default 24)
  final double iconSize;

  const LythIconButton({
    required this.icon,
    this.onPressed,
    this.disabled = false,
    this.color,
    this.tooltip,
    this.iconSize = 24,
    super.key,
  }) : _variant = 0;

  /// Create a filled icon button variant
  const LythIconButton.filled({
    required this.icon,
    required this.onPressed,
    this.color,
    this.tooltip,
    this.iconSize = 24,
    super.key,
  }) : disabled = false,
       _variant = 1;

  /// Create an outlined icon button variant
  const LythIconButton.outlined({
    required this.icon,
    required this.onPressed,
    this.color,
    this.tooltip,
    this.iconSize = 24,
    super.key,
  }) : disabled = false,
       _variant = 2;

  @override
  Widget build(BuildContext context) {
    final style = IconButton.styleFrom(
      minimumSize: const Size(48, 48),
      foregroundColor: color,
    );
    final child = Icon(icon, size: iconSize);
    final callback = disabled ? null : onPressed;
    return switch (_variant) {
      1 => IconButton.filled(
        icon: child,
        onPressed: callback,
        tooltip: tooltip,
        style: style,
      ),
      2 => IconButton.outlined(
        icon: child,
        onPressed: callback,
        tooltip: tooltip,
        style: style.copyWith(
          side: WidgetStatePropertyAll(
            BorderSide(color: context.colorScheme.outline),
          ),
        ),
      ),
      _ => IconButton(
        icon: child,
        onPressed: callback,
        tooltip: tooltip,
        style: style,
      ),
    };
  }
}
