// ignore_for_file: public_member_api_docs

import 'dart:js_interop';

@JS('globalThis.lythausStartupReady')
external JSFunction? get _startupReady;

void dismissStartupPresentation() => _startupReady?.callAsFunction(null);

@JS('globalThis.lythausStartupDeferred')
external JSFunction? get _startupDeferred;

void deferStartupPresentation() => _startupDeferred?.callAsFunction(null);
