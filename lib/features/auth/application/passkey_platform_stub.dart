// ignore_for_file: public_member_api_docs

import 'package:lythaus/features/auth/application/passkey_platform.dart';

PasskeyPlatform createPasskeyPlatform() => _UnsupportedPasskeys();

class _UnsupportedPasskeys implements PasskeyPlatform {
  @override
  bool get supported => false;

  @override
  Future<Map<String, dynamic>> register(Map<String, dynamic> options) =>
      Future.error(UnsupportedError('Passkeys require a supported browser.'));

  @override
  Future<Map<String, dynamic>> authenticate(Map<String, dynamic> options) =>
      Future.error(UnsupportedError('Passkeys require a supported browser.'));
}
