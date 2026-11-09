import 'dart:math' as math;

import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';

enum _SwipeExclusion { control }

/// Keeps interactions such as author links and post actions out of feed swipes.
class FeedSwipeExclusion extends StatelessWidget {
  /// Marks a subtree whose own interactions take precedence.
  const FeedSwipeExclusion({super.key, required this.child});

  /// The interactive subtree.
  final Widget child;

  @override
  Widget build(BuildContext context) =>
      MetaData(metaData: _SwipeExclusion.control, child: child);
}

/// Optional touch shortcut. Native cancellation and vertical scroll win.
class FeedSwipeRegion extends StatefulWidget {
  /// Observes touch input without claiming the gesture arena.
  const FeedSwipeRegion({
    super.key,
    required this.child,
    this.onFeedStep,
    this.onOpenMenu,
  });

  /// Content retaining its own vertical scrolling and pointer cancellation.
  final Widget child;

  /// Receives one step in visible feed order, never a destination index.
  final ValueChanged<int>? onFeedStep;

  /// Opens the panel from the right inset, leaving the outer edge alone.
  final VoidCallback? onOpenMenu;

  @override
  State<FeedSwipeRegion> createState() => _FeedSwipeRegionState();
}

class _FeedSwipeRegionState extends State<FeedSwipeRegion> {
  final _pointers = <int>{};
  int? _pointer;
  Offset? _start;
  Duration? _startedAt;
  bool _edge = false;
  bool _horizontal = false;
  double _width = 0;

  void _cancel() {
    _pointer = null;
    _start = null;
    _startedAt = null;
    _horizontal = false;
  }

  bool _excluded(PointerDownEvent event) {
    final hit = HitTestResult();
    GestureBinding.instance.hitTestInView(hit, event.position, event.viewId);
    return hit.path.any((entry) {
      final target = entry.target;
      if (target is RenderEditable) return true;
      if (target is RenderSemanticsAnnotations) {
        final semantics = target.properties;
        if (semantics.button == true ||
            semantics.textField == true ||
            semantics.link == true ||
            semantics.toggled != null ||
            semantics.checked != null) {
          return true;
        }
      }
      return target is RenderMetaData &&
          target.metaData == _SwipeExclusion.control;
    });
  }

  void _down(PointerDownEvent event) {
    _pointers.add(event.pointer);
    _cancel();
    final focused = FocusManager.instance.primaryFocus?.context;
    final editing =
        focused?.findAncestorWidgetOfExactType<EditableText>() != null;
    if (_pointers.length != 1 ||
        editing ||
        event.kind != PointerDeviceKind.touch ||
        MediaQuery.accessibleNavigationOf(context) ||
        ModalRoute.of(context)?.isCurrent == false ||
        _excluded(event)) {
      return;
    }
    final width = MediaQuery.sizeOf(context).width;
    final x = event.position.dx;
    _edge = x >= width - 48 && x < width - 24;
    if (_edge
        ? widget.onOpenMenu == null
        : widget.onFeedStep == null || x <= 56 || x >= width - 56) {
      return;
    }
    _pointer = event.pointer;
    _start = event.position;
    _startedAt = event.timeStamp;
    _width = width;
  }

  void _move(PointerMoveEvent event) {
    if (event.pointer != _pointer || _start == null) return;
    final delta = event.position - _start!;
    if (event.timeStamp - _startedAt! > const Duration(milliseconds: 650) ||
        MediaQuery.sizeOf(context).width != _width) {
      _cancel();
      return;
    }
    if (!_horizontal && math.max(delta.dx.abs(), delta.dy.abs()) >= 18) {
      if (delta.dx.abs() <= delta.dy.abs() * 2) {
        _cancel();
        return;
      }
      _horizontal = true;
    }
    if (_horizontal && delta.dy.abs() * 2 >= delta.dx.abs()) _cancel();
  }

  void _up(PointerUpEvent event) {
    _pointers.remove(event.pointer);
    if (event.pointer != _pointer || _start == null) return;
    final delta = event.position - _start!;
    final commit =
        _horizontal &&
        event.timeStamp - _startedAt! <= const Duration(milliseconds: 650) &&
        delta.dx.abs() >= (_width * .18).clamp(72, 96) &&
        delta.dx.abs() > delta.dy.abs() * 2;
    final edge = _edge;
    _cancel();
    if (!commit || ModalRoute.of(context)?.isCurrent == false) return;
    if (edge) {
      if (delta.dx < 0) widget.onOpenMenu?.call();
    } else {
      widget.onFeedStep?.call(delta.dx < 0 ? 1 : -1);
    }
  }

  @override
  Widget build(BuildContext context) =>
      NotificationListener<ScrollNotification>(
        onNotification: (notification) {
          if (notification.metrics.axis == Axis.vertical &&
              ((notification is ScrollUpdateNotification &&
                      notification.dragDetails != null &&
                      (notification.scrollDelta?.abs() ?? 0) > .5) ||
                  (notification is OverscrollNotification &&
                      notification.dragDetails != null &&
                      notification.overscroll.abs() > .5))) {
            _cancel();
          }
          return false;
        },
        child: Listener(
          onPointerDown: _down,
          onPointerMove: _move,
          onPointerUp: _up,
          onPointerCancel: (event) {
            _pointers.remove(event.pointer);
            _cancel();
          },
          child: widget.child,
        ),
      );
}
