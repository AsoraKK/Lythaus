import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:lythaus/features/auth/application/auth_providers.dart';
import 'package:lythaus/features/auth/domain/auth_required_exception.dart';
import 'package:lythaus/features/feed/application/social_feed_providers.dart';
import 'package:lythaus/features/feed/domain/models.dart';
import 'package:lythaus/features/feed/domain/social_feed_repository.dart';
import 'package:lythaus/features/notifications/application/notification_api_service.dart';
import 'package:lythaus/features/notifications/application/notification_providers.dart';
import 'package:lythaus/features/notifications/presentation/notifications_screen.dart';
import 'package:lythaus/ui/screens/home/feed_search_screen.dart';
import 'package:lythaus/ui/screens/profile/profile_screen.dart';

class _NotificationApi extends Mock implements NotificationApiService {
  @override
  bool get isCurrentSession => true;
}

class _UnavailableSearchNotifier extends FeedSearchNotifier {
  @override
  Future<FeedResponse> build(FeedSearchKey arg) async =>
      throw const SocialFeedException(
        'Tag search is temporarily unavailable.',
        code: 'tag_search_unavailable',
      );
}

void main() {
  for (final entry in <String, Widget>{
    'profile': const ProfileScreen(),
    'notifications': const NotificationsScreen(),
  }.entries) {
    testWidgets(
      'guest ${entry.key} exposes one large-text sign-in action without protected reads',
      (tester) async {
        final api = _NotificationApi();
        await tester.binding.setSurfaceSize(const Size(320, 800));
        addTearDown(() => tester.binding.setSurfaceSize(null));
        final semantics = tester.ensureSemantics();
        await tester.pumpWidget(
          ProviderScope(
            overrides: [
              guestModeProvider.overrideWith((ref) => true),
              currentUserProvider.overrideWith((ref) => null),
              notificationApiServiceProvider.overrideWithValue(api),
            ],
            child: MaterialApp(
              builder: (context, child) => MediaQuery(
                data: MediaQuery.of(
                  context,
                ).copyWith(textScaler: const TextScaler.linear(2)),
                child: child!,
              ),
              home: entry.value,
            ),
          ),
        );
        await tester.pumpAndSettle();
        expect(find.widgetWithText(FilledButton, 'Sign in'), findsOneWidget);
        expect(find.bySemanticsLabel('Sign in'), findsOneWidget);
        expect(find.text('Retry search'), findsNothing);
        expect(tester.takeException(), isNull);
        verifyZeroInteractions(api);
        semantics.dispose();
      },
    );
  }

  testWidgets(
    'guest tag search shows a public retry state without a sign-in gate',
    (tester) async {
      final api = _NotificationApi();
      await tester.binding.setSurfaceSize(const Size(320, 800));
      addTearDown(() => tester.binding.setSurfaceSize(null));
      final semantics = tester.ensureSemantics();
      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            guestModeProvider.overrideWith((ref) => true),
            currentUserProvider.overrideWith((ref) => null),
            notificationApiServiceProvider.overrideWithValue(api),
            feedSearchProvider.overrideWith(_UnavailableSearchNotifier.new),
          ],
          child: MaterialApp(
            builder: (context, child) => MediaQuery(
              data: MediaQuery.of(
                context,
              ).copyWith(textScaler: const TextScaler.linear(2)),
              child: child!,
            ),
            home: const FeedSearchScreen(initialQuery: 'water'),
          ),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.bySemanticsLabel('Search tags'), findsOneWidget);
      expect(
        find.text('Tag search is temporarily unavailable.'),
        findsOneWidget,
      );
      expect(find.text('Retry search'), findsOneWidget);
      expect(find.widgetWithText(FilledButton, 'Sign in'), findsNothing);
      expect(tester.takeException(), isNull);
      verifyZeroInteractions(api);
      semantics.dispose();
    },
  );

  testWidgets(
    'expired notification session shows account entry without retry',
    (tester) async {
      final api = _NotificationApi();
      when(
        () => api.getNotifications(
          limit: any(named: 'limit'),
          continuationToken: any(named: 'continuationToken'),
        ),
      ).thenThrow(const AuthRequiredException());
      await tester.pumpWidget(
        ProviderScope(
          overrides: [notificationApiServiceProvider.overrideWithValue(api)],
          child: const MaterialApp(home: NotificationsScreen()),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.widgetWithText(FilledButton, 'Sign in'), findsOneWidget);
      expect(find.text('Try Again'), findsNothing);
      verify(() => api.getNotifications(limit: 20)).called(1);
    },
  );
}
