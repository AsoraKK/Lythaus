import 'package:flutter/material.dart';
import 'package:lythaus/design_system/widgets/lyth_brand.dart';

/// Legacy size names retained for callers of the shared wordmark.
enum LythWordmarkSize {
  /// Compact wordmark.
  small(32),

  /// Standard wordmark.
  medium(48),

  /// Prominent wordmark.
  large(64),

  /// Display wordmark.
  xlarge(96);

  /// Logical image height.
  final double height;
  const LythWordmarkSize(this.height);
}

/// The approved wordmark is static and uses the supplied theme variant.
class LythWordmark extends StatelessWidget {
  /// Creates a theme-aware approved wordmark.
  const LythWordmark({super.key, this.size = LythWordmarkSize.medium});

  /// Requested display size.
  final LythWordmarkSize size;

  @override
  Widget build(BuildContext context) => LythWordmarkStatic(size: size);
}

/// Displays the approved outlined wordmark without font substitution or effects.
class LythWordmarkStatic extends StatelessWidget {
  /// Creates a theme-aware approved wordmark.
  const LythWordmarkStatic({super.key, this.size = LythWordmarkSize.medium});

  /// Requested display size.
  final LythWordmarkSize size;

  @override
  Widget build(BuildContext context) =>
      LythBrand(variant: LythBrandVariant.wordmark, height: size.height);
}
