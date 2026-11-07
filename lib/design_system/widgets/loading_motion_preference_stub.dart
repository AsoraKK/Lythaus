import 'package:flutter/foundation.dart';

/// Native accessibility preferences are supplied by MediaQuery.
class LoadingMotionPreference extends ValueNotifier<bool> {
  /// No additional platform preference is needed outside the browser.
  LoadingMotionPreference() : super(false);
}
