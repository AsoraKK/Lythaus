// ignore_for_file: public_member_api_docs

/// Lythaus Wordmark Widget
///
/// Animated wordmark displaying "Lyt haus" with a soft warm ivory glow pulse.
/// The animation respects the accessibility `disableAnimations` setting.
library;

import 'package:flutter/material.dart';

import 'package:lythaus/design_system/theme/theme_build_context_x.dart';
import 'package:lythaus/design_system/tokens/motion.dart';

/// Displays the Lythaus wordmark with a pulsing glow effect.
///
/// Features:
/// - "Lyt haus" text in dull white (#E6E2D9 dark mode, #1A1A1A light mode)
/// - Warm ivory glow (#EDE3C8) that pulses every ~240 seconds
/// - Glow duration: ~8 seconds per pulse
/// - Respects reduce-motion accessibility setting
///
/// Usage:
/// ```dart
/// LythWordmark(
///   size: LythWordmarkSize.large,
/// )
/// ```
class LythWordmark extends StatefulWidget {
  /// Size of the wordmark
  final LythWordmarkSize size;

  /// Custom color override (typically not needed)
  final Color? color;

  const LythWordmark({
    this.size = LythWordmarkSize.medium,
    this.color,
    super.key,
  });

  @override
  State<LythWordmark> createState() => _LythWordmarkState();
}

enum LythWordmarkSize {
  small(32),
  medium(48),
  large(64),
  xlarge(96);

  final double height;

  const LythWordmarkSize(this.height);
}

class _LythWordmarkState extends State<LythWordmark>
    with TickerProviderStateMixin {
  late AnimationController _glowController;
  late Animation<double> _glowAnimation;
  bool _initialized = false;

  @override
  void initState() {
    super.initState();
    // Animation initialization moved to didChangeDependencies
    // because we need MediaQuery context
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (!_initialized) {
      _initialized = true;
      _initializeAnimation();
    } else {
      // Check if reduce-motion setting changed
      final disableAnimations = context.disableAnimations;
      if (disableAnimations && _glowController.isAnimating) {
        _glowController.stop();
      }
    }
  }

  void _initializeAnimation() {
    final disableAnimations = context.disableAnimations;

    if (disableAnimations) {
      // No animation when reduced motion is enabled
      _glowController = AnimationController(
        duration: const Duration(seconds: 1),
        vsync: this,
      );
      _glowAnimation = Tween<double>(begin: 0, end: 0).animate(_glowController);
    } else {
      // Pulse animation: 240 second interval, 8 second duration per pulse
      _glowController = AnimationController(
        duration: LythMotion.wordmarkPulseDuration,
        vsync: this,
      );

      // Create a repeating animation with proper intervals
      _glowAnimation = Tween<double>(begin: 0, end: 1).animate(
        CurvedAnimation(
          parent: _glowController,
          curve: LythMotion.standardCurve,
        ),
      );

      // Schedule repeating pulses with 240-second interval
      _scheduleNextPulse();
    }
  }

  void _scheduleNextPulse() {
    Future.delayed(LythMotion.wordmarkPulseInterval, () {
      if (mounted && !context.disableAnimations) {
        // Run the 8-second glow animation
        _glowController.forward(from: 0).then((_) {
          if (mounted) {
            _scheduleNextPulse();
          }
        });
      }
    });
  }

  @override
  void dispose() {
    _glowController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final colorScheme = context.colorScheme;
    final textColor = (widget.color ?? colorScheme.onSurface).withValues(
      alpha: 0.9,
    );
    final glowColor = colorScheme.primary;
    final textStyle = TextStyle(
      fontSize: widget.size.height * 0.6,
      fontWeight: FontWeight.w700,
      color: textColor,
      letterSpacing: 0.5,
      height: 1.2,
    );

    return AnimatedBuilder(
      animation: _glowAnimation,
      builder: (context, child) {
        final glowOpacity = _glowAnimation.value.clamp(0.0, 1.0).toDouble();
        return Stack(
          alignment: Alignment.center,
          children: [
            // Glow text layer (soft bloom)
            Opacity(
              opacity: glowOpacity,
              child: Text(
                'Lyt haus',
                style: textStyle.copyWith(
                  color: glowColor.withValues(alpha: 0.8),
                  shadows: [
                    Shadow(
                      color: glowColor.withValues(alpha: 0.7),
                      blurRadius: 24,
                    ),
                    Shadow(
                      color: glowColor.withValues(alpha: 0.4),
                      blurRadius: 48,
                    ),
                  ],
                ),
                textAlign: TextAlign.center,
              ),
            ),
            // Foreground text layer
            Text('Lyt haus', style: textStyle, textAlign: TextAlign.center),
          ],
        );
      },
    );
  }
}

/// A simple, non-animated version of the wordmark for static contexts
class LythWordmarkStatic extends StatelessWidget {
  final LythWordmarkSize size;
  final Color? color;

  const LythWordmarkStatic({
    this.size = LythWordmarkSize.medium,
    this.color,
    super.key,
  });

  @override
  Widget build(BuildContext context) {
    final textColor = (color ?? Theme.of(context).colorScheme.onSurface)
        .withValues(alpha: 0.9);

    return Text(
      'Lyt haus',
      style: TextStyle(
        fontSize: size.height * 0.6,
        fontWeight: FontWeight.w700,
        color: textColor,
        letterSpacing: 0.5,
        height: 1.2,
      ),
      textAlign: TextAlign.center,
    );
  }
}
