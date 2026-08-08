import 'package:lythaus/features/notifications/domain/notification_models.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('NotificationCategory', () {
    test('serializes to uppercase and parses back', () {
      expect(NotificationCategory.social.toJson(), 'SOCIAL');
      expect(NotificationCategory.fromJson('NEWS'), NotificationCategory.news);
    });

    test('falls back to social for unknown values', () {
      expect(
        NotificationCategory.fromJson('UNKNOWN'),
        NotificationCategory.social,
      );
    });
  });

  group('NotificationEventType', () {
    test('converts camelCase to screaming snake case', () {
      expect(NotificationEventType.commentReply.toJson(), 'COMMENT_REPLY');
      expect(
        NotificationEventType.moderationAppealDecided.toJson(),
        'MODERATION_APPEAL_DECIDED',
      );
    });

    test('parses screaming snake case to enum', () {
      expect(
        NotificationEventType.fromJson('MODERATION_APPEAL_DECIDED'),
        NotificationEventType.moderationAppealDecided,
      );
    });

    test('falls back to commentCreated for unknown', () {
      expect(
        NotificationEventType.fromJson('NOT_A_REAL_EVENT'),
        NotificationEventType.commentCreated,
      );
    });
  });

  group('Notification', () {
    test('round trips through json', () {
      final createdAt = DateTime.utc(2024, 1, 2, 3, 4, 5);
      final notification = Notification(
        id: 'n1',
        userId: 'u1',
        category: NotificationCategory.social,
        eventType: NotificationEventType.postLiked,
        title: 'Title',
        body: 'Body',
        deeplink: 'lythaus://post/123',
        targetId: 'post-1',
        targetType: 'post',
        read: true,
        readAt: '2024-01-02T03:04:05Z',
        dismissed: false,
        createdAt: createdAt,
      );

      final json = notification.toJson();
      final parsed = Notification.fromJson(json);

      expect(parsed.id, 'n1');
      expect(parsed.eventType, NotificationEventType.postLiked);
      expect(parsed.read, isTrue);
      expect(parsed.createdAt, createdAt);
    });

    test('copyWith overrides fields', () {
      final notification = Notification(
        id: 'n1',
        userId: 'u1',
        category: NotificationCategory.social,
        eventType: NotificationEventType.commentCreated,
        title: 'Title',
        body: 'Body',
        createdAt: DateTime.utc(2024, 1, 1),
      );

      final updated = notification.copyWith(read: true, dismissed: true);
      expect(updated.read, isTrue);
      expect(updated.dismissed, isTrue);
    });
  });

  group('UserNotificationPreferences', () {
    test('round trips through json', () {
      final prefs = UserNotificationPreferences(
        userId: 'u1',
        timezone: 'UTC',
        quietHours: QuietHours.defaultQuietHours,
        categories: const CategoryPreferences(
          social: true,
          news: false,
          marketing: true,
        ),
        updatedAt: DateTime.utc(2024, 1, 1),
      );

      final json = prefs.toJson();
      final parsed = UserNotificationPreferences.fromJson(json);

      expect(parsed.userId, 'u1');
      expect(parsed.categories.marketing, isTrue);
      expect(parsed.quietHours.hours.length, 24);
    });

    test('copyWith overrides fields', () {
      final prefs = UserNotificationPreferences(
        userId: 'u1',
        timezone: 'UTC',
        quietHours: QuietHours.defaultQuietHours,
        categories: const CategoryPreferences(
          social: true,
          news: false,
          marketing: false,
        ),
        updatedAt: DateTime.utc(2024, 1, 1),
      );

      final updated = prefs.copyWith(timezone: 'Africa/Johannesburg');
      expect(updated.timezone, 'Africa/Johannesburg');
      expect(updated.userId, 'u1');
    });
  });

  group('QuietHours', () {
    test('default quiet hours include late night and early morning', () {
      final quiet = QuietHours.defaultQuietHours;
      expect(quiet.hours.length, 24);
      expect(quiet.isQuietAt(23), isTrue);
      expect(quiet.isQuietAt(0), isTrue);
      expect(quiet.isQuietAt(12), isFalse);
    });

    test('isQuietAt returns false for out of range', () {
      final quiet = QuietHours.defaultQuietHours;
      expect(quiet.isQuietAt(-1), isFalse);
      expect(quiet.isQuietAt(24), isFalse);
    });

    test('withHourToggled flips a slot', () {
      final hours = List<bool>.filled(24, false);
      final quiet = QuietHours(hours);
      final toggled = quiet.withHourToggled(3);
      expect(toggled.isQuietAt(3), isTrue);
    });
  });

  group('CategoryPreferences', () {
    test('defaults missing values to safe defaults', () {
      final prefs = CategoryPreferences.fromJson({});
      expect(prefs.social, isTrue);
      expect(prefs.news, isFalse);
      expect(prefs.marketing, isFalse);
    });

    test('copyWith updates fields', () {
      const prefs = CategoryPreferences(
        social: true,
        news: false,
        marketing: false,
      );
      final updated = prefs.copyWith(marketing: true);
      expect(updated.marketing, isTrue);
    });
  });

  group('UserDeviceToken', () {
    test('serializes and parses device token', () {
      final now = DateTime.utc(2024, 1, 1);
      final token = UserDeviceToken(
        id: 'd1',
        userId: 'u1',
        deviceId: 'device-1',
        pushToken: 'token',
        platform: 'fcm',
        label: 'Pixel',
        createdAt: now,
        lastSeenAt: now,
      );

      final json = token.toJson();
      final parsed = UserDeviceToken.fromJson(json);

      expect(parsed.id, 'd1');
      expect(parsed.platform, 'fcm');
      expect(parsed.isActive, isTrue);
    });
  });
}
