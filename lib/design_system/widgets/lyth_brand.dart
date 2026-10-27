import 'package:flutter/material.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_svg/flutter_svg.dart';
import 'package:lythaus/design_system/tokens/semantic_colors.dart';
import 'package:lythaus/design_system/widgets/approved_brand_paths.g.dart';

/// Approved outlines with the shared monochrome treatment.
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
    final aspectRatio = switch (variant) {
      LythBrandVariant.symbol => 1.0,
      LythBrandVariant.wordmark => 470.28944891 / 130.6866688,
    };
    final file = switch (variant) {
      LythBrandVariant.symbol => 'lythaus-symbol-square-warm.fb697a91817f.svg',
      LythBrandVariant.wordmark => 'lythaus-wordmark-white.5ba0451347e2.svg',
    };
    if (kIsWeb) {
      return Semantics(
        label: decorative ? null : 'Lythaus',
        image: !decorative,
        excludeSemantics: true,
        child: SizedBox(
          height: height,
          width: height * aspectRatio,
          child: ColorFiltered(
            colorFilter: const ColorFilter.mode(
              LythSemanticColors.text,
              BlendMode.srcIn,
            ),
            child: CustomPaint(painter: ApprovedBrandPainter(file)),
          ),
        ),
      );
    }
    return SvgPicture.asset(
      'assets/brand/lythaus-v1/$file',
      height: height,
      width: height * aspectRatio,
      fit: BoxFit.contain,
      colorFilter: const ColorFilter.mode(
        LythSemanticColors.text,
        BlendMode.srcIn,
      ),
      semanticsLabel: decorative ? null : 'Lythaus',
      excludeFromSemantics: decorative,
    );
  }
}

/// Paints the supplied SVG outlines directly without an intermediate image.
class ApprovedBrandPainter extends CustomPainter {
  /// Selects an exact approved asset by its fingerprinted filename.
  const ApprovedBrandPainter(this.asset);

  /// The source SVG whose generated geometry and colors are painted.
  final String asset;

  @override
  void paint(Canvas canvas, Size size) {
    final bounds = approvedBrandViewBoxes[asset]!;
    final fitted = applyBoxFit(BoxFit.contain, bounds.size, size).destination;
    canvas.save();
    canvas.translate(
      (size.width - fitted.width) / 2,
      (size.height - fitted.height) / 2,
    );
    canvas.scale(fitted.width / bounds.width, fitted.height / bounds.height);
    canvas.translate(-bounds.left, -bounds.top);
    approvedBrandPaths[asset]!(canvas);
    canvas.restore();
  }

  @override
  bool shouldRepaint(ApprovedBrandPainter oldDelegate) =>
      oldDelegate.asset != asset;
}
