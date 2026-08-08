import 'package:flutter_test/flutter_test.dart';
import 'package:lythaus/features/core/utils/date_formatter.dart';

void main() {
  group('DateFormatter', () {
    late DateTime now;

    setUp(() {
      now = DateTime(
        2023,
        12,
        15,
        14,
        30,
        0,
      ); // Fixed point in time for consistent testing
    });

    group('formatRelative Tests', () {
      test('should return "Just now" for recent times', () {
        final recentTime = now.subtract(const Duration(seconds: 30));
        final result = DateFormatter.formatRelative(recentTime, now: now);
        expect(result, equals('Just now'));
      });

      test('should format minutes correctly', () {
        final minutesAgo = now.subtract(const Duration(minutes: 5));
        final result = DateFormatter.formatRelative(minutesAgo, now: now);
        expect(result, equals('5m ago'));
      });

      test('should format hours correctly', () {
        final hoursAgo = now.subtract(const Duration(hours: 3));
        final result = DateFormatter.formatRelative(hoursAgo, now: now);
        expect(result, equals('3h ago'));
      });

      test('should format days correctly', () {
        final daysAgo = now.subtract(const Duration(days: 5));
        final result = DateFormatter.formatRelative(daysAgo, now: now);
        expect(result, equals('5d ago'));
      });

      test('should format months correctly', () {
        final monthsAgo = now.subtract(const Duration(days: 60));
        final result = DateFormatter.formatRelative(monthsAgo, now: now);
        expect(result, equals('2mo ago'));
      });

      test('should format years correctly', () {
        final yearsAgo = now.subtract(const Duration(days: 400));
        final result = DateFormatter.formatRelative(yearsAgo, now: now);
        expect(result, equals('1y ago'));
      });

      // Test the actual method with current time
      test('should handle current DateTime.now()', () {
        final result = DateFormatter.formatRelative(DateTime.now());
        expect(result, isA<String>());
        // Should be "Just now" or very recent
        expect(
          result,
          anyOf(equals('Just now'), endsWith('m ago'), endsWith('h ago')),
        );
      });
    });

    group('formatAbsolute Tests', () {
      test('should format date correctly', () {
        final testDate = DateTime(2023, 5, 15);
        final result = DateFormatter.formatAbsolute(testDate);

        expect(result, equals('15/5/2023'));
      });

      test('should handle single digit day and month', () {
        final testDate = DateTime(2023, 1, 5);
        final result = DateFormatter.formatAbsolute(testDate);

        expect(result, equals('5/1/2023'));
      });

      test('should handle different years', () {
        final testDate = DateTime(1999, 12, 31);
        final result = DateFormatter.formatAbsolute(testDate);

        expect(result, equals('31/12/1999'));
      });

      test('should handle leap year dates', () {
        final testDate = DateTime(2024, 2, 29);
        final result = DateFormatter.formatAbsolute(testDate);

        expect(result, equals('29/2/2024'));
      });
    });

    group('formatWithTime Tests', () {
      test('should format date with time correctly', () {
        final testDateTime = DateTime(2023, 5, 15, 14, 30);
        final result = DateFormatter.formatWithTime(testDateTime);

        expect(result, equals('15/5/2023 at 14:30'));
      });

      test('should pad single digit hours and minutes', () {
        final testDateTime = DateTime(2023, 5, 15, 9, 5);
        final result = DateFormatter.formatWithTime(testDateTime);

        expect(result, equals('15/5/2023 at 09:05'));
      });

      test('should handle midnight', () {
        final testDateTime = DateTime(2023, 5, 15, 0, 0);
        final result = DateFormatter.formatWithTime(testDateTime);

        expect(result, equals('15/5/2023 at 00:00'));
      });

      test('should handle noon', () {
        final testDateTime = DateTime(2023, 5, 15, 12, 0);
        final result = DateFormatter.formatWithTime(testDateTime);

        expect(result, equals('15/5/2023 at 12:00'));
      });

      test('should handle late evening', () {
        final testDateTime = DateTime(2023, 5, 15, 23, 59);
        final result = DateFormatter.formatWithTime(testDateTime);

        expect(result, equals('15/5/2023 at 23:59'));
      });
    });

    group('formatDuration Tests', () {
      test('should format days correctly', () {
        const duration = Duration(days: 3);
        final result = DateFormatter.formatDuration(duration);

        expect(result, equals('3 days'));
      });

      test('should format single day correctly', () {
        const duration = Duration(days: 1);
        final result = DateFormatter.formatDuration(duration);

        expect(result, equals('1 day'));
      });

      test('should format hours correctly', () {
        const duration = Duration(hours: 5);
        final result = DateFormatter.formatDuration(duration);

        expect(result, equals('5 hours'));
      });

      test('should format single hour correctly', () {
        const duration = Duration(hours: 1);
        final result = DateFormatter.formatDuration(duration);

        expect(result, equals('1 hour'));
      });

      test('should format minutes correctly', () {
        const duration = Duration(minutes: 30);
        final result = DateFormatter.formatDuration(duration);

        expect(result, equals('30 minutes'));
      });

      test('should format single minute correctly', () {
        const duration = Duration(minutes: 1);
        final result = DateFormatter.formatDuration(duration);

        expect(result, equals('1 minute'));
      });

      test('should handle less than a minute', () {
        const duration = Duration(seconds: 30);
        final result = DateFormatter.formatDuration(duration);

        expect(result, equals('Less than a minute'));
      });

      test('should handle zero duration', () {
        const duration = Duration.zero;
        final result = DateFormatter.formatDuration(duration);

        expect(result, equals('Less than a minute'));
      });

      test('should prioritize days over hours', () {
        const duration = Duration(days: 2, hours: 5);
        final result = DateFormatter.formatDuration(duration);

        expect(result, equals('2 days'));
      });

      test('should prioritize hours over minutes', () {
        const duration = Duration(hours: 3, minutes: 30);
        final result = DateFormatter.formatDuration(duration);

        expect(result, equals('3 hours'));
      });
    });

    group('Integration Tests', () {
      test(
        'should maintain consistency between absolute and withTime formats',
        () {
          final testDateTime = DateTime(2023, 5, 15, 14, 30);

          final absoluteResult = DateFormatter.formatAbsolute(testDateTime);
          final withTimeResult = DateFormatter.formatWithTime(testDateTime);

          expect(withTimeResult, startsWith(absoluteResult));
          expect(withTimeResult, contains('at 14:30'));
        },
      );

      test('should handle edge case dates', () {
        final edgeCases = [
          DateTime(1970, 1, 1), // Unix epoch
          DateTime(2000, 1, 1), // Y2K
          DateTime(2024, 2, 29), // Leap year
          DateTime(2023, 12, 31), // End of year
        ];

        for (final date in edgeCases) {
          expect(() => DateFormatter.formatAbsolute(date), returnsNormally);
          expect(() => DateFormatter.formatWithTime(date), returnsNormally);
          expect(() => DateFormatter.formatRelative(date), returnsNormally);
        }
      });

      test('should handle various duration ranges', () {
        final durations = [
          Duration.zero,
          const Duration(seconds: 30),
          const Duration(minutes: 1),
          const Duration(minutes: 59),
          const Duration(hours: 1),
          const Duration(hours: 23),
          const Duration(days: 1),
          const Duration(days: 365),
        ];

        for (final duration in durations) {
          final result = DateFormatter.formatDuration(duration);
          expect(result, isA<String>());
          expect(result.isNotEmpty, isTrue);
        }
      });
    });
  });
}
