// ignore_for_file: public_member_api_docs

import 'dart:js_interop';

@JS('window.lythausReleaseUpdates.setCanReload')
external void _setCanReload(bool canReload);

void setWebReleaseCanReload(bool canReload) {
  try {
    _setCanReload(canReload);
  } catch (_) {
    // The HTML update client can be unavailable in local or partial builds.
  }
}
