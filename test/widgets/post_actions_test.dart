import 'package:lythaus/features/auth/application/auth_providers.dart';
import 'package:lythaus/features/moderation/application/moderation_providers.dart';
import 'package:lythaus/features/moderation/domain/moderation_repository.dart';
import 'package:lythaus/widgets/post_actions.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';

class _MockModerationRepository extends Mock implements ModerationRepository {}

Widget _buildPostActions({
  required ModerationRepository repository,
  String? token,
  bool isLiked = false,
  int likeCount = 0,
  int commentCount = 0,
}) {
  return ProviderScope(
    overrides: [
      moderationClientProvider.overrideWithValue(repository),
      jwtProvider.overrideWith((ref) async => token),
    ],
    child: MaterialApp(
      home: Scaffold(
        body: Center(
          child: PostActions(
            contentId: 'post-1',
            contentType: 'post',
            isLiked: isLiked,
            likeCount: likeCount,
            commentCount: commentCount,
          ),
        ),
      ),
    ),
  );
}

void main() {
  testWidgets('formats counts in action labels', (tester) async {
    final repository = _MockModerationRepository();
    await tester.binding.setSurfaceSize(const Size(1200, 900));
    addTearDown(() => tester.binding.setSurfaceSize(null));

    await tester.pumpWidget(
      _buildPostActions(
        repository: repository,
        token: 'token',
        isLiked: true,
        likeCount: 1500,
        commentCount: 1200000,
      ),
    );

    expect(find.text('1.5K'), findsOneWidget);
    expect(find.text('1.2M'), findsOneWidget);
    expect(find.text('Share'), findsOneWidget);
  });

  testWidgets('submits report and shows success message', (tester) async {
    final repository = _MockModerationRepository();
    await tester.binding.setSurfaceSize(const Size(1200, 900));
    addTearDown(() => tester.binding.setSurfaceSize(null));

    when(
      () => repository.flagContent(
        contentId: 'post-1',
        contentType: 'post',
        reason: any(named: 'reason'),
        additionalDetails: any(named: 'additionalDetails'),
        token: 'token',
      ),
    ).thenAnswer((_) async => {'message': 'Report submitted'});

    await tester.pumpWidget(
      _buildPostActions(repository: repository, token: 'token'),
    );

    await tester.tap(find.text('Report'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Submit Report'));
    await tester.pumpAndSettle();

    verify(
      () => repository.flagContent(
        contentId: 'post-1',
        contentType: 'post',
        reason: any(named: 'reason'),
        additionalDetails: any(named: 'additionalDetails'),
        token: 'token',
      ),
    ).called(1);
    expect(find.text('Report submitted'), findsOneWidget);
  });

  testWidgets('shows auth error when token missing', (tester) async {
    final repository = _MockModerationRepository();
    await tester.binding.setSurfaceSize(const Size(1200, 900));
    addTearDown(() => tester.binding.setSurfaceSize(null));

    await tester.pumpWidget(
      _buildPostActions(repository: repository, token: null),
    );

    await tester.tap(find.text('Report'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Submit Report'));
    await tester.pumpAndSettle();

    expect(find.text('User not authenticated'), findsOneWidget);
    verifyNever(
      () => repository.flagContent(
        contentId: any(named: 'contentId'),
        contentType: any(named: 'contentType'),
        reason: any(named: 'reason'),
        additionalDetails: any(named: 'additionalDetails'),
        token: any(named: 'token'),
      ),
    );
  });

  testWidgets('shows rate limit message on 429', (tester) async {
    final repository = _MockModerationRepository();
    await tester.binding.setSurfaceSize(const Size(1200, 900));
    addTearDown(() => tester.binding.setSurfaceSize(null));

    when(
      () => repository.flagContent(
        contentId: 'post-1',
        contentType: 'post',
        reason: any(named: 'reason'),
        additionalDetails: any(named: 'additionalDetails'),
        token: 'token',
      ),
    ).thenThrow(
      const ModerationException(
        'Too many moderation requests. Please wait before trying again.',
        code: 'RATE_LIMITED',
        statusCode: 429,
      ),
    );

    await tester.pumpWidget(
      _buildPostActions(repository: repository, token: 'token'),
    );

    await tester.tap(find.text('Report'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Submit Report'));
    await tester.pumpAndSettle();

    expect(
      find.text('Too many reports. Please wait before reporting again.'),
      findsOneWidget,
    );
  });
}
