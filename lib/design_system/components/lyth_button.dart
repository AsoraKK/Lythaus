// ignore_for_file: public_member_api_docs

/// Lythaus Button Component
///
/// High-level button component with multiple semantic variants.
/// All styling must use tokens from the design system.
library;

import 'package:flutter/material.dart';

import 'package:lythaus/design_system/theme/theme_build_context_x.dart';

/// Semantic button variants following Lythaus design system
enum LythButtonVariant {
  /// Primary action button (warm ivory background)
  primary,

  /// Secondary action button (outline style)
  secondary,

  /// Tertiary action button (text-only style)
  tertiary,

  /// Destructive action button (error color)
  destructive,
}

/// Size variants for buttons
enum LythButtonSize {
  small(height: 36, horizontal: 12),
  medium(height: 44, horizontal: 16),
  large(height: 52, horizontal: 24);

  final double height;
  final double horizontal;

  const LythButtonSize({required this.height, required this.horizontal});
}

/// Semantic Lythaus button component
///
/// Provides four semantic variants:
/// - **primary**: Warm ivory background, maximum emphasis
/// - **secondary**: Outlined style, medium emphasis
/// - **tertiary**: Text-only, low emphasis
/// - **destructive**: Error color, destructive actions
///
/// All styling uses design system tokens. Do not add hardcoded colors, spacing, or border radius.
///
/// Usage:
/// ```dart
/// LythButton(
///   label: 'Continue',
///   variant: LythButtonVariant.primary,
///   onPressed: () {},
/// )
///
/// LythButton.destructive(
///   label: 'Delete',
///   onPressed: () {},
/// )
/// ```
class LythButton extends StatelessWidget {
  /// Button label text
  final String label;

  /// Button variant (primary, secondary, tertiary, destructive)
  final LythButtonVariant variant;

  /// Button size
  final LythButtonSize size;

  /// Leading icon (optional)
  final IconData? icon;

  /// Icon position (before or after text)
  final bool iconAfter;

  /// Callback when button is pressed
  final VoidCallback? onPressed;

  /// Whether the button is loading
  final bool isLoading;

  /// Custom tooltip message
  final String? tooltip;

  /// Whether button is disabled (independent of onPressed)
  final bool disabled;

  const LythButton({
    required this.label,
    this.variant = LythButtonVariant.primary,
    this.size = LythButtonSize.medium,
    this.icon,
    this.iconAfter = false,
    this.onPressed,
    this.isLoading = false,
    this.tooltip,
    this.disabled = false,
    super.key,
  });

  /// Create a primary action button
  const LythButton.primary({
    required this.label,
    required this.onPressed,
    this.size = LythButtonSize.medium,
    this.icon,
    this.iconAfter = false,
    this.isLoading = false,
    this.tooltip,
    super.key,
  }) : variant = LythButtonVariant.primary,
       disabled = false;

  /// Create a secondary action button
  const LythButton.secondary({
    required this.label,
    required this.onPressed,
    this.size = LythButtonSize.medium,
    this.icon,
    this.iconAfter = false,
    this.isLoading = false,
    this.tooltip,
    super.key,
  }) : variant = LythButtonVariant.secondary,
       disabled = false;

  /// Create a tertiary action button (text-only)
  const LythButton.tertiary({
    required this.label,
    required this.onPressed,
    this.size = LythButtonSize.medium,
    this.icon,
    this.iconAfter = false,
    this.tooltip,
    super.key,
  }) : variant = LythButtonVariant.tertiary,
       disabled = false,
       isLoading = false;

  /// Create a destructive button
  const LythButton.destructive({
    required this.label,
    required this.onPressed,
    this.size = LythButtonSize.medium,
    this.icon,
    this.iconAfter = false,
    this.isLoading = false,
    this.tooltip,
    super.key,
  }) : variant = LythButtonVariant.destructive,
       disabled = false;

  bool get _isDisabled => disabled || isLoading || onPressed == null;

  Widget _buildLabel(BuildContext context) {
    if (isLoading) {
      return SizedBox(
        width: 16,
        height: 16,
        child: CircularProgressIndicator(
          strokeWidth: 2,
          valueColor: AlwaysStoppedAnimation<Color>(
            variant == LythButtonVariant.destructive
                ? context.colorScheme.error
                : variant == LythButtonVariant.secondary
                ? context.colorScheme.onSurface
                : context.colorScheme.onPrimary,
          ),
        ),
      );
    }

    final textColor = variant == LythButtonVariant.destructive
        ? context.colorScheme.error
        : variant == LythButtonVariant.secondary
        ? context.colorScheme.onSurface
        : variant == LythButtonVariant.tertiary
        ? context.colorScheme.primary
        : context.colorScheme.onPrimary;

    final gap = context.spacing.sm;
    final textStyle = Theme.of(
      context,
    ).textTheme.labelLarge?.copyWith(color: textColor);

    if (icon == null) {
      return Text(label, style: textStyle);
    }

    final iconWidget = Icon(icon, size: 18, color: textColor);

    if (iconAfter) {
      return Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(label, style: textStyle),
          SizedBox(width: gap),
          iconWidget,
        ],
      );
    }

    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        iconWidget,
        SizedBox(width: gap),
        Text(label, style: textStyle),
      ],
    );
  }

  @override
  Widget build(BuildContext context) {
    final content = _buildLabel(context);

    Widget button = switch (variant) {
      LythButtonVariant.primary => ElevatedButton(
        onPressed: _isDisabled ? null : onPressed,
        child: content,
      ),
      LythButtonVariant.secondary => OutlinedButton(
        onPressed: _isDisabled ? null : onPressed,
        child: content,
      ),
      LythButtonVariant.tertiary => TextButton(
        onPressed: _isDisabled ? null : onPressed,
        child: content,
      ),
      LythButtonVariant.destructive => ElevatedButton(
        style: ElevatedButton.styleFrom(
          backgroundColor: context.colorScheme.error,
          foregroundColor: context.colorScheme.onError,
        ),
        onPressed: _isDisabled ? null : onPressed,
        child: content,
      ),
    };

    // Apply size constraints
    button = SizedBox(height: size.height, child: button);

    // Add tooltip if provided
    if (tooltip != null) {
      button = Tooltip(message: tooltip!, child: button);
    }

    return button;
  }
}
