import 'package:flutter_test/flutter_test.dart';
import 'package:lythaus/features/feed/domain/comment_notification_link.dart';

void main() {
  const post = '0192c000-0000-7000-8000-000000000001';
  const comment = '0192c000-0000-7000-8000-000000000002';
  final wire = {
    'notificationType': 'content.reply_received',
    'entityId': comment,
    'deeplink': '/post/$post?commentId=$comment',
  };
  test('malformed UTF-8 in lazy URI fields fails closed without throwing', () {
    for (final link in [
      '/post/%FF?commentId=$comment',
      '/post/%C0%AF?commentId=$comment',
      '/post/$post?commentId=%FF',
      '/post/$post?%FF=$comment',
      '/post/$post?commentId=$comment&%FF=1',
    ]) {
      expect(commentNotificationLink({...wire, 'deeplink': link}), isNull);
    }
    expect(commentNotificationLink(wire), '/post/$post?commentId=$comment');
  });
  test(
    'comment notifications link only to the exact first-party comment destination',
    () {
      expect(commentNotificationLink(wire), '/post/$post?commentId=$comment');
      for (final link in [
        'https://outside.invalid/post/$post?commentId=$comment',
        '//outside.invalid/post/$post?commentId=$comment',
        '/post/$post?commentId=$post',
        '/post/$post?commentId=$comment&secret=1',
        '/post/$post?commentId=$comment&commentId=$comment',
        'post/$post?commentId=$comment',
        '/post/$post?commentId=$comment#hidden',
        '/post/invalid?commentId=$comment',
        '/settings/notifications',
      ]) {
        expect(commentNotificationLink({...wire, 'deeplink': link}), isNull);
      }
      expect(
        commentNotificationLink({
          ...wire,
          'notificationType': 'moderation.decision_applied',
        }),
        isNull,
      );
    },
  );
}
