// ignore_for_file: public_member_api_docs

import 'package:lythaus/core/config/web_release_update_bridge_stub.dart'
    if (dart.library.js_interop) 'package:lythaus/core/config/web_release_update_bridge_web.dart'
    as platform;

void setWebReleaseCanReload(bool canReload) =>
    platform.setWebReleaseCanReload(canReload);
