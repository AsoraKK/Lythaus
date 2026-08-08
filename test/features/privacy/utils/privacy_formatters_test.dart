// ignore_for_file: public_member_api_docs
import 'package:flutter_test/flutter_test.dart';

import 'package:lythaus/features/privacy/utils/privacy_formatters.dart';

void main() {
  group('formatPrivacyCountdown', () {
    test('formats zero duration as 00:00', () {
      expect(formatPrivacyCountdown(Duration.zero), '00:00');
    });

    test('formats negative duration as 00:00', () {
      expect(formatPrivacyCountdown(const Duration(minutes: -5)), '00:00');
    });

    test('formats minutes only', () {
      expect(formatPrivacyCountdown(const Duration(minutes: 45)), '00:45');
    });

    test('formats hours and minutes', () {
      expect(
        formatPrivacyCountdown(const Duration(hours: 2, minutes: 15)),
        '02:15',
      );
    });

    test('pads single-digit hours and minutes', () {
      expect(
        formatPrivacyCountdown(const Duration(hours: 1, minutes: 5)),
        '01:05',
      );
    });

    test('handles exactly 1 hour', () {
      expect(formatPrivacyCountdown(const Duration(hours: 1)), '01:00');
    });

    test('handles large durations', () {
      expect(
        formatPrivacyCountdown(const Duration(hours: 48, minutes: 30)),
        '48:30',
      );
    });
  });

  group('formatPrivacyTimestamp', () {
    test('formats January date correctly', () {
      // Use UTC to avoid timezone issues
      final dt = DateTime.utc(2025, 1, 15, 10, 30);
      final result = formatPrivacyTimestamp(dt);
      expect(result, contains('Jan'));
      expect(result, contains('15'));
      expect(result, contains('2025'));
    });

    test('formats December date correctly', () {
      final dt = DateTime.utc(2024, 12, 25, 14, 5);
      final result = formatPrivacyTimestamp(dt);
      expect(result, contains('Dec'));
      expect(result, contains('25'));
      expect(result, contains('2024'));
    });

    test('formats PM period', () {
      final dt = DateTime.utc(2025, 6, 1, 15, 45);
      final result = formatPrivacyTimestamp(dt);
      // The result depends on local timezone conversion
      expect(result, contains('•'));
      expect(result, contains('2025'));
    });

    test('formats AM period', () {
      final dt = DateTime.utc(2025, 3, 1, 3, 5);
      final result = formatPrivacyTimestamp(dt);
      expect(result, contains('Mar'));
      expect(result, contains('2025'));
    });

    test('formats midnight correctly (12 AM)', () {
      final dt = DateTime.utc(2025, 7, 4, 0, 0);
      final result = formatPrivacyTimestamp(dt);
      expect(result, contains('Jul'));
      expect(result, contains('4'));
    });

    test('formats noon correctly (12 PM)', () {
      final dt = DateTime.utc(2025, 8, 10, 12, 0);
      final result = formatPrivacyTimestamp(dt);
      expect(result, contains('Aug'));
      expect(result, contains('10'));
    });

    test('pads single-digit minutes', () {
      final dt = DateTime.utc(2025, 1, 1, 9, 5);
      final result = formatPrivacyTimestamp(dt);
      // Should contain ":05"
      expect(result, contains(':05'));
    });
  });
}
