// ignore_for_file: public_member_api_docs

/// Lythaus Confirm Dialog Component
///
/// High-level dialog for confirmations and destructive actions.
library;

import 'package:flutter/material.dart';

import 'package:lythaus/design_system/theme/theme_build_context_x.dart';
import 'package:lythaus/design_system/components/lyth_button.dart';

/// Semantic confirmation dialog
///
/// Provides a high-level dialog for user confirmations and decisions.
/// Automatically handles layout, spacing, and button positioning.
///
/// Usage:
/// ```dart
/// showDialog<void>(
///   context: context,
///   builder: (context) => LythConfirmDialog(
///     title: 'Delete Item?',
///     message: 'This action cannot be undone.',
///     confirmLabel: 'Delete',
///     onConfirm: () => _delete(),
///   ),
/// )
/// ```
class LythConfirmDialog extends StatelessWidget {
  /// Dialog title
  final String title;

  /// Dialog message body
  final String? message;

  /// Confirm button label
  final String confirmLabel;

  /// Callback when confirmed
  final VoidCallback onConfirm;

  /// Cancel button label (default 'Cancel')
  final String cancelLabel;

  /// Callback when cancelled
  final VoidCallback? onCancel;

  /// Whether confirm action is destructive (red)
  final bool isDestructive;

  /// Custom icon
  final IconData? icon;

  const LythConfirmDialog({
    required this.title,
    required this.confirmLabel,
    required this.onConfirm,
    this.message,
    this.cancelLabel = 'Cancel',
    this.onCancel,
    this.isDestructive = false,
    this.icon,
    super.key,
  });

  /// Create a destructive confirmation dialog
  const LythConfirmDialog.destructive({
    required this.title,
    required this.confirmLabel,
    required this.onConfirm,
    this.message,
    this.cancelLabel = 'Cancel',
    this.onCancel,
    this.icon,
    super.key,
  }) : isDestructive = true;

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: Text(title),
      icon: icon != null ? Icon(icon) : null,
      content: message != null
          ? Text(message!, style: context.textTheme.bodyMedium)
          : null,
      actions: [
        LythButton.secondary(
          label: cancelLabel,
          onPressed: () {
            onCancel?.call();
            Navigator.pop(context);
          },
        ),
        LythButton(
          label: confirmLabel,
          variant: isDestructive
              ? LythButtonVariant.destructive
              : LythButtonVariant.primary,
          onPressed: () {
            onConfirm();
            Navigator.pop(context);
          },
        ),
      ],
    );
  }
}
