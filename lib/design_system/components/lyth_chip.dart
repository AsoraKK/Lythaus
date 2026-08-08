// ignore_for_file: public_member_api_docs

/// Lythaus Chip Component
///
/// Compact, interactive component for tags, filters, and selections.
library;

import 'package:flutter/material.dart';

import 'package:lythaus/design_system/theme/theme_build_context_x.dart';

/// Semantic chip component
///
/// High-level wrapper for Chip with consistent styling.
/// Used for tags, filters, selections, and input tokens.
///
/// Usage:
/// ```dart
/// LythChip(
///   label: 'Flutter',
///   onDeleted: () {},
/// )
///
/// LythChip.filter(
///   label: 'Active',
///   selected: true,
///   onSelected: (selected) {},
/// )
/// ```
class LythChip extends StatelessWidget {
  /// Chip label
  final String label;

  /// Leading icon
  final IconData? icon;

  /// Callback when chip is deleted
  final VoidCallback? onDeleted;

  /// Whether chip is selected (for filter chips)
  final bool selected;

  /// Callback when selected state changes
  final ValueChanged<bool>? onSelected;

  /// Custom background color
  final Color? backgroundColor;

  /// Custom text color
  final Color? labelColor;

  /// Whether chip is disabled
  final bool disabled;

  const LythChip({
    required this.label,
    this.icon,
    this.onDeleted,
    this.selected = false,
    this.onSelected,
    this.backgroundColor,
    this.labelColor,
    this.disabled = false,
    super.key,
  });

  /// Create a filter chip variant (can be selected/deselected)
  const LythChip.filter({
    required this.label,
    required this.onSelected,
    this.selected = false,
    this.icon,
    String? tooltip,
    super.key,
  }) : onDeleted = null,
       backgroundColor = null,
       labelColor = null,
       disabled = false;

  /// Create an input chip (with delete)
  const LythChip.input({
    required this.label,
    required this.onDeleted,
    this.icon,
    super.key,
  }) : selected = false,
       onSelected = null,
       backgroundColor = null,
       labelColor = null,
       disabled = false;

  @override
  Widget build(BuildContext context) {
    if (onSelected != null) {
      // Filter chip
      return FilterChip(
        label: Text(label),
        avatar: icon != null ? Icon(icon) : null,
        selected: selected,
        onSelected: disabled ? null : onSelected,
        backgroundColor:
            backgroundColor ?? context.colorScheme.surfaceContainer,
        selectedColor: backgroundColor ?? context.colorScheme.primary,
        labelStyle: TextStyle(
          color: selected
              ? context.colorScheme.onPrimary
              : context.colorScheme.onSurface,
        ),
      );
    } else if (onDeleted != null) {
      // Input chip
      return InputChip(
        label: Text(label),
        avatar: icon != null ? Icon(icon) : null,
        onDeleted: disabled ? null : onDeleted,
        backgroundColor:
            backgroundColor ?? context.colorScheme.surfaceContainer,
        labelStyle: TextStyle(color: context.colorScheme.onSurface),
      );
    } else {
      // Static chip
      return Chip(
        label: Text(label),
        avatar: icon != null ? Icon(icon) : null,
        backgroundColor:
            backgroundColor ?? context.colorScheme.surfaceContainer,
        labelStyle: TextStyle(color: context.colorScheme.onSurface),
      );
    }
  }
}
