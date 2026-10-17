import 'package:flutter/material.dart';
import 'package:flutter_svg/flutter_svg.dart';

/// Approved artwork treatments; the supplied outlines are never recolored.
enum LythBrandVariant {
  /// Square compact LH symbol.
  symbol,

  /// Outlined titlecase wordmark alone.
  wordmark,
}

/// Displays the approved brand at its original aspect ratio.
class LythBrand extends StatelessWidget {
  /// Use [decorative] when a containing control already describes its action.
  const LythBrand({
    super.key,
    this.variant = LythBrandVariant.wordmark,
    this.height = 32,
    this.decorative = false,
  });

  /// Selects the approved layout for this slot.
  final LythBrandVariant variant;

  /// Rendered logical height; width retains the supplied aspect ratio.
  final double height;

  /// Omits the image label when the parent supplies the control's meaning.
  final bool decorative;

  @override
  Widget build(BuildContext context) {
    final dark = Theme.of(context).brightness == Brightness.dark;
    final aspectRatio = switch (variant) {
      LythBrandVariant.symbol => 1.0,
      LythBrandVariant.wordmark => 470.28944891 / 130.6866688,
    };
    final file = switch (variant) {
      LythBrandVariant.symbol =>
        dark
            ? 'lythaus-symbol-square-warm.fb697a91817f.svg'
            : 'lythaus-symbol-square-black.6a1b6d025e69.svg',
      LythBrandVariant.wordmark =>
        dark
            ? 'lythaus-wordmark-white.5ba0451347e2.svg'
            : 'lythaus-wordmark-black.e450176663e0.svg',
    };
    return SvgPicture.asset(
      'assets/brand/lythaus-v1/$file',
      height: height,
      width: height * aspectRatio,
      fit: BoxFit.contain,
      semanticsLabel: decorative ? null : 'Lythaus',
      excludeFromSemantics: decorative,
    );
  }
}
