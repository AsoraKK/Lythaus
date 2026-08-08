import 'package:flutter_test/flutter_test.dart';
import 'package:lythaus/core/utils/daily_limit_message.dart';

void main() {
  group('dailyLimitMessage', () {
    final baseTime = DateTime(2025, 1, 1, 10, 0, 0);

    test('formats a comment limit notice with duration', () {
      final payload = {
        'tier': 'free',
        'limit': 20,
        'resetAt': DateTime(2025, 1, 1, 12, 0, 0).toIso8601String(),
      };

      final message = dailyLimitMessage(
        payload: payload,
        actionLabel: 'comments',
        now: baseTime,
      );

      expect(message, contains('daily comments limit of 20'));
      expect(message, contains('(FREE tier)'));
      expect(message, contains('in 2h 0m'));
    });

    test('falls back to "later" when reset time is missing', () {
      final payload = {'tier': 'premium', 'limit': 3};

      final message = dailyLimitMessage(
        payload: payload,
        actionLabel: 'appeals',
        now: baseTime,
      );

      expect(message, contains('daily appeals limit of 3'));
      expect(message, contains('(PREMIUM tier)'));
      expect(message, contains('Try again later'));
    });

    test('formats seconds when reset is under one minute', () {
      final payload = {
        'tier': 'free',
        'limit': 1,
        'resetAt': DateTime(2025, 1, 1, 10, 0, 30).toIso8601String(),
      };

      final message = dailyLimitMessage(
        payload: payload,
        actionLabel: 'posts',
        now: baseTime,
      );

      expect(message, contains('in 30s'));
    });

    test('formats minutes when reset is under one hour', () {
      final payload = {
        'tier': 'black',
        'limit': 7,
        'resetAt': DateTime(2025, 1, 1, 10, 45, 0).toIso8601String(),
      };

      final message = dailyLimitMessage(
        payload: payload,
        actionLabel: 'comments',
        now: baseTime,
      );

      expect(message, contains('(BLACK tier)'));
      expect(message, contains('in 45m'));
    });

    test('uses default placeholders when tier/limit are missing', () {
      final payload = <String, dynamic>{'resetAt': 'invalid-date'};

      final message = dailyLimitMessage(
        payload: payload,
        actionLabel: 'shares',
        now: baseTime,
      );

      expect(message, contains('your limit (YOUR TIER tier)'));
      expect(message, contains('Try again later'));
    });
  });
}
