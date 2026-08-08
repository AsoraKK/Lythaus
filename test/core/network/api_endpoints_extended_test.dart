// ignore_for_file: public_member_api_docs
import 'package:flutter_test/flutter_test.dart';

import 'package:lythaus/core/network/api_endpoints.dart';

void main() {
  group('ApiEndpoints.appealFlag', () {
    test('returns correct appeal URL with flag ID', () {
      final url = ApiEndpoints.appealFlag('flag-abc-123');
      expect(url, contains('/moderation/appeal/flag-abc-123'));
    });

    test('includes the base API prefix', () {
      final url = ApiEndpoints.appealFlag('test');
      expect(url, startsWith('/api'));
    });
  });
}
