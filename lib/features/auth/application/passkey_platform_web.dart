// ignore_for_file: public_member_api_docs

import 'dart:js_interop';

import 'package:lythaus/features/auth/application/passkey_platform.dart';

@JS('SimpleWebAuthnBrowser')
external JSObject? get _library;

@JS('isSecureContext')
external bool get _isSecureContext;

@JS('SimpleWebAuthnBrowser.browserSupportsWebAuthn')
external bool _browserSupportsWebAuthn();

@JS('SimpleWebAuthnBrowser.startRegistration')
external JSPromise<JSObject> _startRegistration(JSObject options);

@JS('SimpleWebAuthnBrowser.startAuthentication')
external JSPromise<JSObject> _startAuthentication(JSObject options);

PasskeyPlatform createPasskeyPlatform() => _BrowserPasskeys();

class _BrowserPasskeys implements PasskeyPlatform {
  @override
  bool get supported =>
      _isSecureContext && _library != null && _browserSupportsWebAuthn();

  @override
  Future<Map<String, dynamic>> register(Map<String, dynamic> options) async {
    final result = await _startRegistration(
      {'optionsJSON': options}.jsify()! as JSObject,
    ).toDart;
    return Map<String, dynamic>.from(result.dartify()! as Map);
  }

  @override
  Future<Map<String, dynamic>> authenticate(
    Map<String, dynamic> options,
  ) async {
    final result = await _startAuthentication(
      {'optionsJSON': options}.jsify()! as JSObject,
    ).toDart;
    return Map<String, dynamic>.from(result.dartify()! as Map);
  }
}
