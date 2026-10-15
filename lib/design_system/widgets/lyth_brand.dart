// ignore_for_file: public_member_api_docs

import 'package:flutter/material.dart';
import 'package:flutter_svg/flutter_svg.dart';

class LythBrandMark extends StatelessWidget {
  const LythBrandMark({
    super.key,
    this.size = 28,
    this.excludeFromSemantics = false,
  });

  final double size;
  final bool excludeFromSemantics;

  @override
  Widget build(BuildContext context) => SvgPicture.asset(
    'assets/brand/lythaus_mark.svg',
    width: size,
    height: size,
    semanticsLabel: 'Lythaus',
    excludeFromSemantics: excludeFromSemantics,
    colorFilter: ColorFilter.mode(
      Theme.of(context).colorScheme.onSurface,
      BlendMode.srcIn,
    ),
  );
}

class LythBrandWordmark extends StatelessWidget {
  const LythBrandWordmark({super.key, this.height = 16});

  final double height;

  @override
  Widget build(BuildContext context) => SvgPicture.asset(
    'assets/brand/lythaus_wordmark.svg',
    width: height * 1000 / 174,
    height: height,
    semanticsLabel: 'Lythaus',
    colorFilter: ColorFilter.mode(
      Theme.of(context).colorScheme.onSurface,
      BlendMode.srcIn,
    ),
  );
}
