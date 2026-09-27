// ignore_for_file: public_member_api_docs

import 'package:flutter/material.dart';

import 'package:lythaus/design_system/tokens/semantic_colors.dart';

class LythColorSchemes {
  static ColorScheme light() => _scheme(Brightness.light);

  static ColorScheme dark() => _scheme(Brightness.dark);

  static ColorScheme _scheme(Brightness brightness) {
    final colors = LythSemanticColors.of(brightness);
    final inverse = LythSemanticColors.of(
      brightness == Brightness.light ? Brightness.dark : Brightness.light,
    );
    return ColorScheme(
      brightness: brightness,
      surface: colors['canvas']!,
      surfaceDim: colors['canvas'],
      surfaceBright: colors['surfaceRaised'],
      surfaceContainerLowest: colors['canvas'],
      surfaceContainerLow: colors['surface'],
      surfaceContainer: colors['surface'],
      surfaceContainerHigh: colors['surfaceRaised'],
      surfaceContainerHighest: colors['surfaceRaised'],
      onSurface: colors['text']!,
      onSurfaceVariant: colors['secondary'],
      outline: colors['control'],
      outlineVariant: colors['border'],
      primary: colors['accent']!,
      onPrimary: colors['onAccent']!,
      primaryContainer: colors['selection'],
      onPrimaryContainer: colors['onSelection'],
      secondary: colors['secondary']!,
      onSecondary: colors['surface']!,
      secondaryContainer: colors['surfaceRaised'],
      onSecondaryContainer: colors['text'],
      tertiary: colors['info'],
      onTertiary: colors['canvas'],
      tertiaryContainer: colors['infoSurface'],
      onTertiaryContainer: colors['info'],
      error: colors['danger']!,
      onError: colors['onDanger']!,
      errorContainer: colors['dangerSurface'],
      onErrorContainer: colors['danger'],
      inverseSurface: inverse['surface'],
      onInverseSurface: inverse['text'],
      inversePrimary: inverse['accent'],
      surfaceTint: Colors.transparent,
      scrim: Colors.black,
    );
  }

  /// The background must be opaque; translucent foregrounds are composited first.
  static double contrastRatio(Color foreground, Color background) {
    if (background.a != 1) {
      throw ArgumentError.value(background, 'background', 'Must be opaque');
    }
    final composite = Color.alphaBlend(foreground, background);
    final foregroundLuminance = composite.computeLuminance();
    final backgroundLuminance = background.computeLuminance();
    final lighter = foregroundLuminance > backgroundLuminance
        ? foregroundLuminance
        : backgroundLuminance;
    final darker = foregroundLuminance <= backgroundLuminance
        ? foregroundLuminance
        : backgroundLuminance;
    return (lighter + 0.05) / (darker + 0.05);
  }
}
