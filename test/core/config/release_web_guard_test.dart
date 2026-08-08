import 'package:flutter_test/flutter_test.dart';

import 'package:lythaus/core/config/web_release_guard.dart';

void main() {
  group('web release guard', () {
    test('recognizes private and local hosts', () {
      expect(isPrivateOrLocalHost('localhost'), isTrue);
      expect(isPrivateOrLocalHost('127.0.0.1'), isTrue);
      expect(isPrivateOrLocalHost('10.1.2.3'), isTrue);
      expect(isPrivateOrLocalHost('192.168.0.10'), isTrue);
      expect(isPrivateOrLocalHost('172.16.1.5'), isTrue);
      expect(isPrivateOrLocalHost('app.lythaus.com'), isFalse);
    });

    test('rejects empty or private release origins', () {
      expect(
        () => requirePublicHttpsOrigin('API_BASE_URL', ''),
        throwsStateError,
      );
      expect(
        () => requirePublicHttpsOrigin('API_BASE_URL', 'http://localhost/api'),
        throwsStateError,
      );
      expect(
        () => requirePublicHttpsOrigin('API_BASE_URL', 'https://localhost/api'),
        throwsStateError,
      );
      expect(
        () => requirePublicHttpsOrigin(
          'API_BASE_URL',
          'https://192.168.0.10/api',
        ),
        throwsStateError,
      );
      expect(
        () => requirePublicHttpsOrigin(
          'API_BASE_URL',
          'https://app.lythaus.com/api',
        ),
        returnsNormally,
      );
    });
  });
}
