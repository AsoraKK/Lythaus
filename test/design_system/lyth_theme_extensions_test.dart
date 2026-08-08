/// Unit tests for LythThemeExtension and token wrapper classes.
library;

import 'package:flutter_test/flutter_test.dart';

import 'package:lythaus/design_system/theme/lyth_theme_extensions.dart';
import 'package:lythaus/design_system/tokens/motion.dart';
import 'package:lythaus/design_system/tokens/radius.dart';
import 'package:lythaus/design_system/tokens/spacing.dart';

void main() {
  // ── LythThemeExtension ─────────────────────────────────────────────────────
  group('LythThemeExtension', () {
    test('light() constructs without error', () {
      expect(() => LythThemeExtension.light(), returnsNormally);
    });

    test('dark() constructs without error', () {
      expect(() => LythThemeExtension.dark(), returnsNormally);
    });

    test('copyWith overrides spacing', () {
      const base = LythThemeExtension(
        spacing: SpacingTokens(),
        radius: RadiusTokens(),
        motion: MotionTokens(),
      );
      final copy = base.copyWith(spacing: const SpacingTokens());
      expect(copy.spacing, isA<SpacingTokens>());
    });

    test('copyWith preserves other fields when only one is overridden', () {
      final ext = LythThemeExtension.light();
      final copy = ext.copyWith(radius: const RadiusTokens());
      expect(copy.motion, equals(ext.motion));
      expect(copy.spacing, equals(ext.spacing));
    });

    test('lerp with non-LythThemeExtension returns self', () {
      final ext = LythThemeExtension.light();
      final result = ext.lerp(null, 0.5);
      expect(result, same(ext));
    });

    test('lerp with same type returns LythThemeExtension', () {
      final ext = LythThemeExtension.light();
      final result = ext.lerp(LythThemeExtension.dark(), 0.5);
      expect(result, isA<LythThemeExtension>());
    });
  });

  // ── SpacingTokens ──────────────────────────────────────────────────────────
  group('SpacingTokens', () {
    const tokens = SpacingTokens();

    test('xs delegates to LythSpacing.xs', () {
      expect(tokens.xs, equals(LythSpacing.xs));
    });

    test('sm delegates to LythSpacing.sm', () {
      expect(tokens.sm, equals(LythSpacing.sm));
    });

    test('md delegates to LythSpacing.md', () {
      expect(tokens.md, equals(LythSpacing.md));
    });

    test('lg delegates to LythSpacing.lg', () {
      expect(tokens.lg, equals(LythSpacing.lg));
    });

    test('cardPadding delegates to LythSpacing.cardPadding', () {
      expect(tokens.cardPadding, equals(LythSpacing.cardPadding));
    });

    test('screenHorizontal delegates to LythSpacing.screenHorizontal', () {
      expect(tokens.screenHorizontal, equals(LythSpacing.screenHorizontal));
    });

    test('minTapTarget delegates to LythSpacing.minTapTarget', () {
      expect(tokens.minTapTarget, equals(LythSpacing.minTapTarget));
    });
  });

  // ── RadiusTokens ──────────────────────────────────────────────────────────
  group('RadiusTokens', () {
    const tokens = RadiusTokens();

    test('xs delegates to LythRadius.xs', () {
      expect(tokens.xs, equals(LythRadius.xs));
    });

    test('md delegates to LythRadius.md', () {
      expect(tokens.md, equals(LythRadius.md));
    });

    test('card delegates to LythRadius.card', () {
      expect(tokens.card, equals(LythRadius.card));
    });

    test('button delegates to LythRadius.button', () {
      expect(tokens.button, equals(LythRadius.button));
    });

    test('pill delegates to LythRadius.pill', () {
      expect(tokens.pill, equals(LythRadius.pill));
    });
  });

  // ── MotionTokens ──────────────────────────────────────────────────────────
  group('MotionTokens', () {
    const tokens = MotionTokens();

    test('quick delegates to LythMotion.quick', () {
      expect(tokens.quick, equals(LythMotion.quick));
    });

    test('standard delegates to LythMotion.standard', () {
      expect(tokens.standard, equals(LythMotion.standard));
    });

    test('standardCurve delegates to LythMotion.standardCurve', () {
      expect(tokens.standardCurve, equals(LythMotion.standardCurve));
    });

    test('emphasisCurve delegates to LythMotion.emphasisCurve', () {
      expect(tokens.emphasisCurve, equals(LythMotion.emphasisCurve));
    });

    test(
      'wordmarkPulseInterval delegates to LythMotion.wordmarkPulseInterval',
      () {
        expect(
          tokens.wordmarkPulseInterval,
          equals(LythMotion.wordmarkPulseInterval),
        );
      },
    );
  });
}
