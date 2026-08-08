import 'package:lythaus/features/privacy/utils/privacy_formatters.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('formatPrivacyCountdown', () {
    test('formats positive duration with hh:mm', () {
      final result = formatPrivacyCountdown(
        const Duration(hours: 2, minutes: 5),
      );
      expect(result, '02:05');
    });

    test('clamps negative duration to zero', () {
      final result = formatPrivacyCountdown(const Duration(minutes: -3));
      expect(result, '00:00');
    });
  });

  group('formatPrivacyTimestamp', () {
    test('formats timestamp with month, day, and time', () {
      final date = DateTime(2024, 5, 10, 15, 30);
      final formatted = formatPrivacyTimestamp(date);
      expect(formatted.contains('May 10, 2024'), isTrue);
      expect(formatted.contains('•'), isTrue);
    });
  });
}
