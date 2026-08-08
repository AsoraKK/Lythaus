/// Lythaus Snackbar Component
///
/// High-level wrapper for showing feedback messages.
library;

import 'package:flutter/material.dart';

import 'package:lythaus/design_system/theme/theme_build_context_x.dart';

/// Semantic snackbar messages
///
/// High-level wrapper providing convenient methods for showing snackbars
/// with consistent styling and behavior.
///
/// Usage:
/// ```dart
/// // Success message
/// LythSnackbar.success(
///   context: context,
///   message: 'Item saved!',
/// )
///
/// // Error message
/// LythSnackbar.error(
///   context: context,
///   message: 'Something went wrong',
///   action: SnackBarAction(label: 'Retry', onPressed: () {}),
/// )
///
/// // Info message
/// LythSnackbar.info(
///   context: context,
///   message: 'New message received',
/// )
/// ```
class LythSnackbar {
  /// Show a success snackbar
  static void success({
    required BuildContext context,
    required String message,
    Duration duration = const Duration(seconds: 4),
    SnackBarAction? action,
  }) {
    _show(
      context,
      message: message,
      backgroundColor: context.colorScheme.surface,
      textColor: context.colorScheme.onSurface,
      duration: duration,
      action: action,
    );
  }

  /// Show an error snackbar
  static void error({
    required BuildContext context,
    required String message,
    Duration duration = const Duration(seconds: 6),
    SnackBarAction? action,
  }) {
    _show(
      context,
      message: message,
      backgroundColor: context.colorScheme.error,
      textColor: context.colorScheme.onError,
      duration: duration,
      action: action,
    );
  }

  /// Show an info snackbar
  static void info({
    required BuildContext context,
    required String message,
    Duration duration = const Duration(seconds: 4),
    SnackBarAction? action,
  }) {
    _show(
      context,
      message: message,
      backgroundColor: context.colorScheme.surfaceContainer,
      textColor: context.colorScheme.onSurface,
      duration: duration,
      action: action,
    );
  }

  /// Show a warning snackbar
  static void warning({
    required BuildContext context,
    required String message,
    Duration duration = const Duration(seconds: 5),
    SnackBarAction? action,
  }) {
    _show(
      context,
      message: message,
      backgroundColor: context.colorScheme.surface,
      textColor: context.colorScheme.onSurface,
      duration: duration,
      action: action,
    );
  }

  static void _show(
    BuildContext context, {
    required String message,
    required Color backgroundColor,
    required Color textColor,
    required Duration duration,
    SnackBarAction? action,
  }) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(message, style: TextStyle(color: textColor)),
        backgroundColor: backgroundColor,
        duration: duration,
        action: action,
      ),
    );
  }
}
