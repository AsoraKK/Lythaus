// ignore_for_file: public_member_api_docs

/// Lythaus Theme Extensions
///
/// Extends ThemeData with tokens not covered by standard Material 3 ColorScheme.
/// Provides access to spacing, radius, and motion tokens via Theme.of(context).extension.
library;

import 'package:flutter/material.dart';

import 'package:lythaus/design_system/tokens/motion.dart';
import 'package:lythaus/design_system/tokens/radius.dart';
import 'package:lythaus/design_system/tokens/spacing.dart';

/// ThemeExtension for Lythaus design tokens
class LythThemeExtension extends ThemeExtension<LythThemeExtension> {
  const LythThemeExtension({
    required this.spacing,
    required this.radius,
    required this.motion,
  });

  /// Spacing tokens
  final SpacingTokens spacing;

  /// Radius tokens
  final RadiusTokens radius;

  /// Motion tokens
  final MotionTokens motion;

  /// Create a default instance
  factory LythThemeExtension.light() {
    return const LythThemeExtension(
      spacing: SpacingTokens(),
      radius: RadiusTokens(),
      motion: MotionTokens(),
    );
  }

  /// Create a default instance for dark mode
  factory LythThemeExtension.dark() {
    return const LythThemeExtension(
      spacing: SpacingTokens(),
      radius: RadiusTokens(),
      motion: MotionTokens(),
    );
  }

  @override
  LythThemeExtension copyWith({
    SpacingTokens? spacing,
    RadiusTokens? radius,
    MotionTokens? motion,
  }) {
    return LythThemeExtension(
      spacing: spacing ?? this.spacing,
      radius: radius ?? this.radius,
      motion: motion ?? this.motion,
    );
  }

  @override
  LythThemeExtension lerp(ThemeExtension<LythThemeExtension>? other, double t) {
    if (other is! LythThemeExtension) return this;
    return const LythThemeExtension(
      spacing: SpacingTokens(),
      radius: RadiusTokens(),
      motion: MotionTokens(),
    );
  }
}

/// Spacing tokens wrapper
class SpacingTokens {
  const SpacingTokens();

  double get xs => LythSpacing.xs;
  double get sm => LythSpacing.sm;
  double get md => LythSpacing.md;
  double get lg => LythSpacing.lg;
  double get xl => LythSpacing.xl;
  double get xxl => LythSpacing.xxl;
  double get xxxl => LythSpacing.xxxl;
  double get huge => LythSpacing.huge;
  double get cardPadding => LythSpacing.cardPadding;
  double get screenHorizontal => LythSpacing.screenHorizontal;
  double get screenVertical => LythSpacing.screenVertical;
  double get listItemGap => LythSpacing.listItemGap;
  double get minTapTarget => LythSpacing.minTapTarget;
}

/// Radius tokens wrapper
class RadiusTokens {
  const RadiusTokens();

  double get xs => LythRadius.xs;
  double get sm => LythRadius.sm;
  double get md => LythRadius.md;
  double get lg => LythRadius.lg;
  double get xl => LythRadius.xl;
  double get pill => LythRadius.pill;
  double get circle => LythRadius.circle;
  double get card => LythRadius.card;
  double get button => LythRadius.button;
  double get input => LythRadius.input;
  double get dialog => LythRadius.dialog;
}

/// Motion tokens wrapper
class MotionTokens {
  const MotionTokens();

  Duration get quick => LythMotion.quick;
  Duration get standard => LythMotion.standard;
  Duration get prominent => LythMotion.prominent;
  Duration get slow => LythMotion.slow;
  Duration get wordmarkPulseInterval => LythMotion.wordmarkPulseInterval;
  Duration get wordmarkPulseDuration => LythMotion.wordmarkPulseDuration;
  Curve get standardCurve => LythMotion.standardCurve;
  Curve get entranceCurve => LythMotion.entranceCurve;
  Curve get exitCurve => LythMotion.exitCurve;
  Curve get emphasisCurve => LythMotion.emphasisCurve;
}
