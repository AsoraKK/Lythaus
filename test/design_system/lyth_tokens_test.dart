/// Unit tests for Lythaus design token classes (spacing, radius, motion).
///
/// These are pure value classes — no widget pump needed.
library;

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:lythaus/design_system/index.dart';

void main() {
  // ── LythSpacing ────────────────────────────────────────────────────────────
  group('LythSpacing', () {
    test('xs < sm < md < lg < xl < xxl < xxxl < huge', () {
      expect(LythSpacing.xs, lessThan(LythSpacing.sm));
      expect(LythSpacing.sm, lessThan(LythSpacing.md));
      expect(LythSpacing.md, lessThan(LythSpacing.lg));
      expect(LythSpacing.lg, lessThan(LythSpacing.xl));
      expect(LythSpacing.xl, lessThan(LythSpacing.xxl));
      expect(LythSpacing.xxl, lessThan(LythSpacing.xxxl));
      expect(LythSpacing.xxxl, lessThan(LythSpacing.huge));
    });

    test('xs is 4', () => expect(LythSpacing.xs, 4.0));
    test('sm is 8', () => expect(LythSpacing.sm, 8.0));
    test('md is 12', () => expect(LythSpacing.md, 12.0));
    test('lg is 16', () => expect(LythSpacing.lg, 16.0));

    test('minTapTarget is at least 44 (WCAG recommendation)', () {
      expect(LythSpacing.minTapTarget, greaterThanOrEqualTo(44.0));
    });

    test('cardPadding equals lg', () {
      expect(LythSpacing.cardPadding, LythSpacing.lg);
    });

    test('screenHorizontal equals lg', () {
      expect(LythSpacing.screenHorizontal, LythSpacing.lg);
    });

    test('screenVertical equals lg', () {
      expect(LythSpacing.screenVertical, LythSpacing.lg);
    });

    test('listItemGap is positive', () {
      expect(LythSpacing.listItemGap, greaterThan(0));
    });
  });

  // ── LythRadius ─────────────────────────────────────────────────────────────
  group('LythRadius', () {
    test('xs < sm < md < lg < xl < pill < circle', () {
      expect(LythRadius.xs, lessThan(LythRadius.sm));
      expect(LythRadius.sm, lessThan(LythRadius.md));
      expect(LythRadius.md, lessThan(LythRadius.lg));
      expect(LythRadius.lg, lessThan(LythRadius.xl));
      expect(LythRadius.xl, lessThan(LythRadius.pill));
      expect(LythRadius.pill, lessThan(LythRadius.circle));
    });

    test('xs is 4', () => expect(LythRadius.xs, 4.0));
    test('sm is 8', () => expect(LythRadius.sm, 8.0));
    test('md is 12', () => expect(LythRadius.md, 12.0));
    test('lg is 16', () => expect(LythRadius.lg, 16.0));
    test('circle is a large sentinel value', () {
      expect(LythRadius.circle, greaterThanOrEqualTo(999.0));
    });
  });

  // ── LythMotion ─────────────────────────────────────────────────────────────
  group('LythMotion', () {
    test('quick < standard < prominent', () {
      expect(
        LythMotion.quick.inMilliseconds,
        lessThan(LythMotion.standard.inMilliseconds),
      );
      expect(
        LythMotion.standard.inMilliseconds,
        lessThan(LythMotion.prominent.inMilliseconds),
      );
    });

    test('quick is 100 ms', () {
      expect(LythMotion.quick, const Duration(milliseconds: 100));
    });

    test('standard is 200 ms', () {
      expect(LythMotion.standard, const Duration(milliseconds: 200));
    });

    test('prominent is 300 ms', () {
      expect(LythMotion.prominent, const Duration(milliseconds: 300));
    });

    test('slow is at least 5 s (wordmark glow)', () {
      expect(LythMotion.slow.inSeconds, greaterThanOrEqualTo(5));
    });

    test('standardCurve is not null', () {
      expect(LythMotion.standardCurve, isNotNull);
    });

    test('emphasisCurve is not null', () {
      expect(LythMotion.emphasisCurve, isNotNull);
    });

    test('entranceCurve is not null', () {
      expect(LythMotion.entranceCurve, isNotNull);
    });

    test('exitCurve is not null', () {
      expect(LythMotion.exitCurve, isNotNull);
    });
  });

  // ── LythColorSchemes ───────────────────────────────────────────────────────
  group('LythColorSchemes', () {
    test('light() produces a light-brightness ColorScheme', () {
      final scheme = LythColorSchemes.light();
      expect(scheme.brightness, Brightness.light);
    });

    test('light() surface is non-pure-white (warm off-white)', () {
      final scheme = LythColorSchemes.light();
      // Warm off-white should NOT be pure white 0xFFFFFFFF
      expect(scheme.surface.toARGB32(), isNot(0xFFFFFFFF));
    });

    test('dark() produces a dark-brightness ColorScheme', () {
      final scheme = LythColorSchemes.dark();
      expect(scheme.brightness, Brightness.dark);
    });

    test('light primary is accessible (onPrimary contrasts primary)', () {
      final scheme = LythColorSchemes.light();
      // Just verify the values are distinct (actual contrast calc is not in scope)
      expect(scheme.primary, isNot(scheme.onPrimary));
    });

    test('contrastRatio is >= 1.0 for any color pair', () {
      final ratio = LythColorSchemes.contrastRatio(
        const Color(0xFF000000),
        const Color(0xFFFFFFFF),
      );
      expect(ratio, greaterThanOrEqualTo(1.0));
    });

    test('contrastRatio(black, white) ~= 21', () {
      final ratio = LythColorSchemes.contrastRatio(
        const Color(0xFF000000),
        const Color(0xFFFFFFFF),
      );
      expect(ratio, closeTo(21.0, 0.5));
    });

    test('contrastRatio(same color) == 1.0', () {
      final ratio = LythColorSchemes.contrastRatio(
        const Color(0xFF888888),
        const Color(0xFF888888),
      );
      expect(ratio, closeTo(1.0, 0.01));
    });

    test('contrastRatio is symmetric', () {
      const fg = Color(0xFF1A1A1A);
      const bg = Color(0xFFF3F1EC);
      final r1 = LythColorSchemes.contrastRatio(fg, bg);
      final r2 = LythColorSchemes.contrastRatio(bg, fg);
      expect(r1, closeTo(r2, 0.001));
    });

    test('light error color is distinct from surface', () {
      final scheme = LythColorSchemes.light();
      expect(scheme.error, isNot(scheme.surface));
    });

    test('dark surface is distinct from light surface', () {
      final light = LythColorSchemes.light();
      final dark = LythColorSchemes.dark();
      expect(light.surface, isNot(dark.surface));
    });

    test('dark primary is the same warm ivory as light', () {
      final light = LythColorSchemes.light();
      final dark = LythColorSchemes.dark();
      expect(light.primary, equals(dark.primary));
    });
  });
}
