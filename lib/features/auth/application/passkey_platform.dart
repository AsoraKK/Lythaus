// ignore_for_file: public_member_api_docs

export 'passkey_platform_stub.dart'
    if (dart.library.js_interop) 'passkey_platform_web.dart';

abstract interface class PasskeyPlatform {
  bool get supported;
  Future<Map<String, dynamic>> register(Map<String, dynamic> options);
  Future<Map<String, dynamic>> authenticate(Map<String, dynamic> options);
}
