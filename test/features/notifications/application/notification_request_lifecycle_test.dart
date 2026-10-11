import 'dart:async';

import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lythaus/features/auth/domain/auth_required_exception.dart';
import 'package:lythaus/features/notifications/application/notification_api_service.dart';
import 'package:lythaus/features/notifications/application/notification_providers.dart';
import 'package:lythaus/features/notifications/domain/notification_models.dart';

Notification _item(String id) => Notification(
  id: id,
  userId: 'synthetic-owner',
  category: NotificationCategory.system,
  eventType: NotificationEventType.accountChange,
  title: 'Synthetic update $id',
  body: '',
  createdAt: DateTime.utc(2026, 10, 1),
);

NotificationsListResponse _page(List<String> ids, {String? cursor}) =>
    NotificationsListResponse(
      notifications: ids.map(_item).toList(),
      continuationToken: cursor,
      totalUnread: ids.length,
    );

UserNotificationPreferences _preferences(bool push) =>
    UserNotificationPreferences.fromJson({
      'emailEnabled': true,
      'pushEnabled': push,
      'repliesEnabled': true,
      'moderationEnabled': true,
      'rewardsEnabled': false,
    }, ownerId: 'synthetic-owner');

class _Api extends NotificationApiService {
  _Api() : super(dioClient: Dio());
  final pages = <Completer<NotificationsListResponse>>[];
  final cursors = <String?>[];
  final actions = <Completer<void>>[];
  final actionIds = <String>[];
  final reads = <Completer<UserNotificationPreferences>>[];
  final saves = <Completer<UserNotificationPreferences>>[];

  @override
  Future<NotificationsListResponse> getNotifications({
    int limit = 20,
    String? continuationToken,
  }) {
    cursors.add(continuationToken);
    final pending = Completer<NotificationsListResponse>();
    pages.add(pending);
    return pending.future;
  }

  Future<void> _action(String id) {
    actionIds.add(id);
    final pending = Completer<void>();
    actions.add(pending);
    return pending.future;
  }

  @override
  Future<void> markAsRead(String notificationId) => _action(notificationId);

  @override
  Future<void> dismissNotification(String notificationId) =>
      _action(notificationId);

  @override
  Future<UserNotificationPreferences> getPreferences() {
    final pending = Completer<UserNotificationPreferences>();
    reads.add(pending);
    return pending.future;
  }

  @override
  Future<UserNotificationPreferences> updatePreferences(
    UserNotificationPreferences preferences,
  ) {
    final pending = Completer<UserNotificationPreferences>();
    saves.add(pending);
    return pending.future;
  }
}

void main() {
  late _Api api;
  late NotificationsController controller;
  setUp(() {
    api = _Api();
    controller = NotificationsController(api);
    controller.state = NotificationsState(
      notifications: [_item('first')],
      continuationToken: 'page-2',
    );
  });
  tearDown(() => controller.dispose());

  test('overlapping pages retain one row per notification ID', () async {
    final loading = controller.loadMore();
    api.pages.single.complete(_page(['first', 'second', 'second']));
    await loading;
    expect(controller.state.notifications.map((item) => item.id), [
      'first',
      'second',
    ]);
  });

  test('a repeated cursor fails truthfully without adding rows', () async {
    final loading = controller.loadMore();
    api.pages.single.complete(_page(['second'], cursor: 'page-2'));
    await loading;
    expect(controller.state.hasError, isTrue);
    expect(controller.state.notifications.single.id, 'first');
    expect(controller.state.continuationToken, 'page-2');
  });

  test('pagination retry clears the error and permits the next page', () async {
    final failed = controller.loadMore();
    api.pages.last.completeError(StateError('synthetic offline'));
    await failed;
    expect(controller.state.hasError, isTrue);
    final retry = controller.loadMore();
    api.pages.last.complete(_page(['second'], cursor: 'page-3'));
    await retry;
    expect(controller.state.hasError, isFalse);
    expect(controller.state.errorMessage, isNull);
    final next = controller.loadMore();
    api.pages.last.complete(_page(['third']));
    await next;
    expect(api.cursors, ['page-2', 'page-2', 'page-3']);
    expect(controller.state.notifications, hasLength(3));
  });

  for (final refresh in [false, true]) {
    for (final dismiss in [false, true]) {
      test(
        'late ${refresh ? 'refresh' : 'page'} preserves confirmed ${dismiss ? 'dismiss' : 'read'}',
        () async {
          final loading = refresh
              ? controller.loadNotifications()
              : controller.loadMore();
          final action = dismiss
              ? controller.dismiss('first')
              : controller.markAsRead('first');
          api.actions.single.complete();
          await action;
          api.pages.single.complete(_page(['first', 'second']));
          await loading;
          final rows = controller.state.notifications;
          if (dismiss) {
            expect(rows.map((item) => item.id), ['second']);
          } else {
            expect(rows.where((item) => item.id == 'first'), hasLength(1));
            expect(rows.first.read, isTrue);
          }
        },
      );
    }
  }

  for (final dismiss in [false, true]) {
    test(
      'revoked session during ${dismiss ? 'dismiss' : 'read'} clears rows',
      () async {
        final action = dismiss
            ? controller.dismiss('first')
            : controller.markAsRead('first');
        api.actions.single.completeError(const AuthRequiredException());
        await action;
        expect(controller.state.authRequired, isTrue);
        expect(controller.state.notifications, isEmpty);
        expect(controller.state.continuationToken, isNull);
      },
    );
  }

  test('repeated pending read calls issue one mutation', () async {
    final first = controller.markAsRead('first');
    final repeated = controller.markAsRead('first');
    expect(api.actions, hasLength(1));
    for (final action in api.actions) {
      action.complete();
    }
    await Future.wait([first, repeated]);
    expect(controller.state.notifications.single.read, isTrue);
  });

  test('older preference read cannot replace an acknowledged save', () async {
    final preferences = PreferencesController(api);
    addTearDown(preferences.dispose);
    final loading = preferences.load();
    final saving = preferences.update(_preferences(true));
    api.saves.single.complete(_preferences(true));
    await saving;
    api.reads.single.complete(_preferences(false));
    await loading;
    expect(preferences.state.requireValue.delivery!['pushEnabled'], isTrue);
  });

  test('older preference error cannot replace an acknowledged save', () async {
    final preferences = PreferencesController(api);
    addTearDown(preferences.dispose);
    final loading = preferences.load();
    final saving = preferences.update(_preferences(true));
    api.saves.single.complete(_preferences(true));
    await saving;
    api.reads.single.completeError(StateError('synthetic delayed read'));
    await loading;
    expect(preferences.state.hasError, isFalse);
    expect(preferences.state.requireValue.delivery!['pushEnabled'], isTrue);
  });

  test('latest preference load wins over an earlier response', () async {
    final preferences = PreferencesController(api);
    addTearDown(preferences.dispose);
    final older = preferences.load();
    final newer = preferences.load();
    api.reads.last.complete(_preferences(true));
    await newer;
    api.reads.first.complete(_preferences(false));
    await older;
    expect(preferences.state.requireValue.delivery!['pushEnabled'], isTrue);
  });

  test(
    'a cursor cycle is rejected and first-page refresh resets its history',
    () async {
      final second = controller.loadMore();
      api.pages.last.complete(_page(['second'], cursor: 'page-3'));
      await second;
      final third = controller.loadMore();
      api.pages.last.complete(_page(['third'], cursor: 'page-2'));
      await third;
      expect(controller.state.hasError, isTrue);
      expect(controller.state.notifications, hasLength(2));
      final refresh = controller.loadNotifications();
      api.pages.last.complete(_page(['first'], cursor: 'page-2'));
      await refresh;
      final restarted = controller.loadMore();
      api.pages.last.complete(_page(['second'], cursor: 'page-3'));
      await restarted;
      expect(controller.state.hasError, isFalse);
      expect(controller.state.notifications, hasLength(2));
    },
  );

  test(
    'load and a repeated save cannot race a pending preference save',
    () async {
      final preferences = PreferencesController(api);
      addTearDown(preferences.dispose);
      final saving = preferences.update(_preferences(true));
      await preferences.load();
      await expectLater(
        preferences.update(_preferences(false)),
        throwsStateError,
      );
      expect(api.reads, isEmpty);
      expect(api.saves, hasLength(1));
      api.saves.single.complete(_preferences(true));
      await saving;
      expect(preferences.state.requireValue.delivery!['pushEnabled'], isTrue);
    },
  );
}
