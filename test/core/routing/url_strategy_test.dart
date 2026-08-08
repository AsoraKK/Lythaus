import 'package:lythaus/core/routing/url_strategy.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('platform URL strategy configuration is safe to invoke', () {
    expect(configureAppUrlStrategy, returnsNormally);
  });
}
