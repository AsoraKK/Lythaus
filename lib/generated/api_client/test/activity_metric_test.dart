import 'package:test/test.dart';
import 'package:lythaus_api_client/lythaus_api_client.dart';

// tests for ActivityMetric
void main() {
  final instance = ActivityMetricBuilder();
  // TODO add properties to the builder and call build()

  group(ActivityMetric, () {
    // String state
    test('to test the property `state`', () async {
      // TODO
    });

    // int value
    test('to test the property `value`', () async {
      // TODO
    });

    // Positive observed active count only when coverage is incomplete. Never valid for quiet.
    // int observedLowerBound
    test('to test the property `observedLowerBound`', () async {
      // TODO
    });

    // int cohortSize
    test('to test the property `cohortSize`', () async {
      // TODO
    });

    // DateTime since
    test('to test the property `since`', () async {
      // TODO
    });

    // Exclusive completed UTC-day boundary.
    // DateTime until
    test('to test the property `until`', () async {
      // TODO
    });

    // String reason
    test('to test the property `reason`', () async {
      // TODO
    });

  });
}
