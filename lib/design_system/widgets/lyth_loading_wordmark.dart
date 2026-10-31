import 'dart:math' as math;
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:lythaus/design_system/tokens/semantic_colors.dart';
import 'package:lythaus/design_system/widgets/lyth_brand.dart';
import 'package:lythaus/design_system/widgets/loading_motion_preference_stub.dart'
    if (dart.library.js_interop) 'package:lythaus/design_system/widgets/loading_motion_preference_web.dart';

/// The website's approved wordmark and light, while an existing load is active.
class LythLoadingWordmark extends StatefulWidget {
  /// Leaves a static, readable wordmark when [active] is false.
  const LythLoadingWordmark({
    super.key,
    required this.active,
    this.height = 40,
  });

  /// Presentation only; the caller owns readiness, errors and authentication.
  final bool active;

  /// The unchanged brand slot height, with artwork fitted proportionally.
  final double height;

  @override
  State<LythLoadingWordmark> createState() => _LythLoadingWordmarkState();
}

class _LythLoadingWordmarkState extends State<LythLoadingWordmark>
    with SingleTickerProviderStateMixin, WidgetsBindingObserver {
  late final AnimationController _light = AnimationController(
    vsync: this,
    duration: const Duration(seconds: 3),
  )..addListener(_rememberReveal);
  bool _revealed = false;
  bool _foreground = true;
  bool _motionAllowed = false;
  bool _presentationFramePending = false;
  late final LoadingMotionPreference _browserMotion;

  @override
  void initState() {
    super.initState();
    _browserMotion = LoadingMotionPreference()..addListener(_onMotionChanged);
    WidgetsBinding.instance.addObserver(this);
    final lifecycle = WidgetsBinding.instance.lifecycleState;
    _foreground = lifecycle == null || lifecycle == AppLifecycleState.resumed;
  }

  void _rememberReveal() {
    if (_light.value >= .4 ||
        (_light.lastElapsedDuration?.inMilliseconds ?? 0) >= 1200) {
      _revealed = true;
    }
  }

  void _onMotionChanged() {
    _sync();
    setState(() {});
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _sync();
  }

  @override
  void didUpdateWidget(LythLoadingWordmark oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (!oldWidget.active && widget.active) _revealed = false;
    _sync();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    _foreground = state == AppLifecycleState.resumed;
    _sync();
  }

  void _sync() {
    final motionWasAllowed = _motionAllowed;
    _motionAllowed =
        !MediaQuery.disableAnimationsOf(context) && !_browserMotion.value;
    if (widget.active && motionWasAllowed && !_motionAllowed) {
      _scheduleStaticPresentation();
    }
    final running =
        widget.active &&
        _motionAllowed &&
        _foreground &&
        TickerMode.valuesOf(context).enabled &&
        (ModalRoute.isCurrentOf(context) ?? true);
    if (running && !_light.isAnimating) {
      _light.repeat();
    } else if (!running) {
      _light.stop();
      if (!widget.active || !_motionAllowed) {
        _light.value = 0;
        _revealed = widget.active && !_motionAllowed;
      }
    }
  }

  void _scheduleStaticPresentation() {
    if (_presentationFramePending) return;
    _presentationFramePending = true;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _presentationFramePending = false;
      if (mounted && widget.active && !_motionAllowed) {
        WidgetsBinding.instance.scheduleFrame();
      }
    });
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _browserMotion.dispose();
    _light.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (!widget.active || !_motionAllowed) {
      return LythBrand(height: widget.height);
    }
    return Semantics(
      label: 'Lythaus',
      image: true,
      excludeSemantics: true,
      child: RepaintBoundary(
        child: SizedBox(
          height: widget.height,
          width: widget.height * 470.28944891 / 130.6866688,
          child: CustomPaint(
            painter: _LoadingWordmarkPainter(
              _light,
              active: widget.active && _motionAllowed,
              revealed: () => _revealed,
              compact: MediaQuery.sizeOf(context).width <= 700,
            ),
          ),
        ),
      ),
    );
  }
}

class _LoadingWordmarkPainter extends CustomPainter {
  _LoadingWordmarkPainter(
    this.light, {
    required this.active,
    required this.revealed,
    required this.compact,
  }) : super(repaint: light);

  final Animation<double> light;
  final bool active;
  final bool Function() revealed;
  final bool compact;
  static const _scene = Rect.fromLTWH(0, 0, 1000, 166);
  static const _space = Rect.fromLTWH(-600, -500, 2300, 1150);
  static const _ivory = LythSemanticColors.text;
  static const _gold = LythSemanticColors.accent;
  static const _brand = ApprovedBrandPainter(
    'lythaus-wordmark-white.5ba0451347e2.svg',
  );

  void _artwork(Canvas canvas, Color color) {
    canvas.saveLayer(
      _scene,
      Paint()..colorFilter = ColorFilter.mode(color, BlendMode.srcIn),
    );
    _brand.paint(canvas, _scene.size);
    canvas.restore();
  }

  double _energy(double progress, List<double> stops, List<double> values) {
    for (var i = 1; i < stops.length; i++) {
      if (progress <= stops[i]) {
        final t = (progress - stops[i - 1]) / (stops[i] - stops[i - 1]);
        return values[i - 1] + (values[i] - values[i - 1]) * t;
      }
    }
    return values.last;
  }

  void _ellipse(
    Canvas canvas,
    double x,
    double y,
    double rx,
    double ry,
    List<Color> colors,
    List<double> stops,
  ) {
    canvas.save();
    canvas.translate(x, y);
    canvas.scale(rx, ry);
    canvas.drawCircle(
      Offset.zero,
      1,
      Paint()..shader = ui.Gradient.radial(Offset.zero, 1, colors, stops),
    );
    canvas.restore();
  }

  @override
  void paint(Canvas canvas, Size size) {
    const artworkWidth = 166 * 470.28944891 / 130.6866688;
    final scale = math.min(size.width / artworkWidth, size.height / 166);
    canvas.save();
    canvas.translate(
      (size.width - 1000 * scale) / 2,
      (size.height - 166 * scale) / 2,
    );
    canvas.scale(scale);
    canvas.clipRect(_space);
    final time = light.value * 3000;
    final progress = ((time - 120) / 1080).clamp(0.0, 1.0);
    final projected = (math.tan((progress - .5) * 1.1) / math.tan(.55) + 1) / 2;
    final x = -70 + 1140 * projected;
    if (!active || revealed()) {
      _artwork(canvas, _ivory);
    } else {
      _artwork(canvas, LythSemanticColors.canvas);
      canvas.saveLayer(_scene, Paint());
      _artwork(canvas, _ivory);
      canvas.drawRect(
        _scene,
        Paint()
          ..blendMode = BlendMode.dstIn
          ..shader = ui.Gradient.linear(Offset(x - 12, 0), Offset(x, 0), [
            _ivory,
            _ivory.withValues(alpha: 0),
          ]),
      );
      canvas.restore();
    }
    if (!active || time < 120 || time >= 1320) {
      canvas.restore();
      return;
    }
    final energy = _energy(
      ((time - 120) / 1200).clamp(0.0, 1.0),
      [0, .08, .26, .43, .56, .7, .88, 1],
      [0, .34, .7, 1, 1, .62, .26, 0],
    );
    List<Color> atmosphere(double gain) => [
      _ivory.withValues(alpha: .8 * gain),
      _gold.withValues(alpha: .55 * gain),
      _gold.withValues(alpha: .1 * gain),
      _gold.withValues(alpha: 0),
    ];
    List<Color> bloom(double gain) => [
      _ivory.withValues(alpha: .96 * gain),
      _ivory.withValues(alpha: .9 * gain),
      _gold.withValues(alpha: .5 * gain),
      _gold.withValues(alpha: 0),
    ];
    canvas.save();
    canvas.translate(500, 80);
    canvas.scale(x - 500, 1);
    canvas.drawPath(
      Path()
        ..moveTo(0, 0)
        ..quadraticBezierTo(.45, -12, 1, -100)
        ..lineTo(1, 100)
        ..quadraticBezierTo(.45, 12, 0, 0)
        ..close(),
      Paint()
        ..shader = ui.Gradient.linear(
          const Offset(0, -100),
          const Offset(0, 100),
          [
            _gold.withValues(alpha: 0),
            _gold.withValues(alpha: .18 * energy),
            _ivory.withValues(alpha: .52 * energy),
            _gold.withValues(alpha: .18 * energy),
            _gold.withValues(alpha: 0),
          ],
          [0, .35, .5, .65, 1],
        ),
    );
    canvas.restore();
    canvas.saveLayer(_scene, Paint());
    _brand.paint(canvas, _scene.size);
    canvas.saveLayer(_scene, Paint()..blendMode = BlendMode.srcIn);
    void reflection(double center, double radius, double height, double gain) =>
        _ellipse(
          canvas,
          center,
          80,
          radius,
          height,
          [
            _ivory.withValues(alpha: gain),
            _ivory.withValues(alpha: .98 * gain),
            _ivory.withValues(alpha: .5 * gain),
            _gold.withValues(alpha: 0),
          ],
          [0, .16, .48, 1],
        );
    reflection(
      x - 1140 * 120 / 1080 / 2,
      1140 * 120 / 1080 / 2,
      170,
      .65 * energy,
    );
    reflection(x, 21, 155, energy);
    canvas.restore();
    canvas.restore();
    _ellipse(canvas, x - 18, 80, 250, 300, atmosphere(energy), [
      0,
      .35,
      .68,
      1,
    ]);
    _ellipse(
      canvas,
      x,
      80,
      compact ? 76 : 88,
      compact ? 148 : 164,
      bloom(energy),
      [0, .12, .36, 1],
    );
    final core = _energy(progress, [0, .05, .9, 1], [0, 1, 1, 0]);
    _ellipse(canvas, 500, 80, 42, 34, atmosphere(.42 * core), [0, .35, .68, 1]);
    _ellipse(canvas, 500, 80, 16, 12, bloom(core), [0, .12, .36, 1]);
    _ellipse(
      canvas,
      500,
      80,
      3,
      4,
      [
        _ivory.withValues(alpha: core),
        _ivory.withValues(alpha: core),
        _ivory.withValues(alpha: 0),
      ],
      [0, .3, 1],
    );
    canvas.restore();
  }

  @override
  bool shouldRepaint(_LoadingWordmarkPainter oldDelegate) =>
      oldDelegate.active != active || oldDelegate.compact != compact;
}
