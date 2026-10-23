// ignore_for_file: public_member_api_docs

import 'package:lythaus/core/config/startup_presentation_stub.dart'
    if (dart.library.js_interop) 'package:lythaus/core/config/startup_presentation_web.dart'
    as platform;

void dismissStartupPresentation() => platform.dismissStartupPresentation();
