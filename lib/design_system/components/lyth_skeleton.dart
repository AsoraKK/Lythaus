/// Lythaus Skeleton Component
///
/// Loading placeholder component for content.
library;

import 'package:flutter/material.dart';

import 'package:lythaus/design_system/theme/theme_build_context_x.dart';

/// Semantic skeleton (loading placeholder) component
///
/// Provides animated placeholder for content that's loading.
/// Respects reduce-motion accessibility setting.
///
/// Usage:
/// ```dart
/// LythSkeleton.line(height: 16)
/// LythSkeleton.box(width: 100, height: 100)
/// LythSkeleton.circle(radius: 24)
/// ```
class LythSkeleton extends StatefulWidget {
  /// Skeleton width
  final double? width;

  /// Skeleton height
  final double height;

  /// Border radius for rectangular skeleton
  final double? borderRadius;

  /// Whether to show animation
  final bool animate;

  /// Shape of the skeleton
  final _SkeletonShape _shape;

  const LythSkeleton._({
    this.width,
    required this.height,
    this.borderRadius,
    required _SkeletonShape shape,
    this.animate = true,
    super.key,
  }) : _shape = shape;

  /// Line skeleton (text placeholder)
  const factory LythSkeleton.line({required double height, double? width}) =
      _LineSkeleton;

  /// Box skeleton (image/content placeholder)
  const factory LythSkeleton.box({
    required double width,
    required double height,
    double? borderRadius,
  }) = _BoxSkeleton;

  /// Circle skeleton (avatar placeholder)
  const factory LythSkeleton.circle({required double radius}) = _CircleSkeleton;

  @override
  State<LythSkeleton> createState() => _LythSkeletonState();
}

enum _SkeletonShape { line, box, circle }

class _LineSkeleton extends LythSkeleton {
  const _LineSkeleton({required super.height, super.width})
    : super._(borderRadius: 4, shape: _SkeletonShape.line);
}

class _BoxSkeleton extends LythSkeleton {
  const _BoxSkeleton({
    required double super.width,
    required super.height,
    super.borderRadius,
  }) : super._(shape: _SkeletonShape.box);
}

class _CircleSkeleton extends LythSkeleton {
  const _CircleSkeleton({required double radius})
    : super._(
        height: radius * 2,
        width: radius * 2,
        borderRadius: radius,
        shape: _SkeletonShape.circle,
      );
}

class _LythSkeletonState extends State<LythSkeleton>
    with SingleTickerProviderStateMixin {
  AnimationController? _controller;
  late Animation<double> _opacity;
  bool _animationInitialized = false;

  @override
  void initState() {
    super.initState();
    // _setupAnimation() must be called from didChangeDependencies because it
    // needs MediaQuery, which is an inherited widget unavailable in initState.
  }

  void _setupAnimation() {
    final mediaQuery = MediaQuery.of(context);
    final shouldAnimate = widget.animate && !mediaQuery.disableAnimations;

    if (shouldAnimate) {
      _controller = AnimationController(
        duration: const Duration(milliseconds: 1500),
        vsync: this,
      )..repeat(reverse: true);

      _opacity = Tween<double>(
        begin: 0.5,
        end: 1.0,
      ).animate(CurvedAnimation(parent: _controller!, curve: Curves.easeInOut));
    } else {
      _opacity = const AlwaysStoppedAnimation<double>(0.7);
    }
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (!_animationInitialized) {
      _setupAnimation();
      _animationInitialized = true;
      return;
    }
    // Re-check animation settings if they change
    final mediaQuery = MediaQuery.of(context);
    final ctrl = _controller;
    if (ctrl != null && ctrl.isAnimating == mediaQuery.disableAnimations) {
      if (mediaQuery.disableAnimations) {
        ctrl.stop();
      } else if (!ctrl.isAnimating) {
        ctrl.repeat(reverse: true);
      }
    }
  }

  @override
  void dispose() {
    _controller?.dispose();
    super.dispose();
  }

  @override
  @override
  Widget build(BuildContext context) {
    final baseColor = context.colorScheme.surface;
    final color = Color.lerp(baseColor, context.colorScheme.outline, 0.1)!;

    return AnimatedBuilder(
      animation: _opacity,
      builder: (context, _) => SizedBox(
        width: widget.width,
        height: widget.height,
        child: Container(
          decoration: BoxDecoration(
            color: color.withValues(alpha: 0.7 * _opacity.value),
            // borderRadius and BoxShape.circle are mutually exclusive in Flutter.
            borderRadius:
                widget.borderRadius != null &&
                    widget._shape != _SkeletonShape.circle
                ? BorderRadius.circular(widget.borderRadius!)
                : null,
            shape: widget._shape == _SkeletonShape.circle
                ? BoxShape.circle
                : BoxShape.rectangle,
          ),
        ),
      ),
    );
  }
}
