import 'package:lythaus/core/analytics/analytics_client.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('NullAnalyticsClient no-ops without error', () async {
    const client = NullAnalyticsClient();

    await client.logEvent('event');
    await client.setUserId('user-1');
    await client.setUserProperties({'tier': 'bronze'});
    await client.reset();
  });
}
