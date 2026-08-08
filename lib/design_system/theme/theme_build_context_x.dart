/// Theme build context extensions
///
/// Provides convenient accessors for theme tokens via BuildContext.
library;

import 'package:flutter/material.dart';

import 'package:lythaus/design_system/theme/lyth_theme_extensions.dart';

/// Extension methods for accessing Lythaus theme tokens
extension LythBuildContextX on BuildContext {
  /// Get the current color scheme
  ColorScheme get colorScheme => Theme.of(this).colorScheme;

  /// Get spacing tokens
  SpacingTokens get spacing =>
      Theme.of(this).extension<LythThemeExtension>()?.spacing ??
      const SpacingTokens();

  /// Get radius tokens
  RadiusTokens get radius =>
      Theme.of(this).extension<LythThemeExtension>()?.radius ??
      const RadiusTokens();

  /// Get motion tokens
  MotionTokens get motion =>
      Theme.of(this).extension<LythThemeExtension>()?.motion ??
      const MotionTokens();

  /// Get text theme
  TextTheme get textTheme => Theme.of(this).textTheme;

  /// Check if animations are disabled (accessibility)
  bool get disableAnimations =>
      MediaQuery.of(this).disableAnimations ||
      MediaQuery.of(this).boldText; // conservative fallback
}
