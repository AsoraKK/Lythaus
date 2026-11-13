import 'dart:js_interop';

import 'package:flutter/foundation.dart';
import 'package:web/web.dart' as web;

/// Supplies the browser preference independently of Flutter engine support.
class LoadingMotionPreference extends ValueNotifier<bool> {
  /// Observes changes for the lifetime of a mounted loading wordmark.
  LoadingMotionPreference()
    : _query = web.window.matchMedia('(prefers-reduced-motion: reduce)'),
      super(false) {
    value = _query.matches;
    _listener = ((web.Event event) {
      value = _query.matches;
    }).toJS;
    _query.addEventListener('change', _listener);
  }

  final web.MediaQueryList _query;
  late final JSFunction _listener;

  @override
  void dispose() {
    _query.removeEventListener('change', _listener);
    super.dispose();
  }
}
