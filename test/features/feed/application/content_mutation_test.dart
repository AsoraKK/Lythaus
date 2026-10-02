import 'package:lythaus/features/feed/application/content_recovery_storage.dart';
import '../../../helpers/content_recovery.dart';
import 'dart:async';

import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:lythaus/features/auth/application/auth_providers.dart';
import 'package:lythaus/features/feed/application/content_mutation.dart';
import 'package:lythaus/features/feed/application/post_creation_providers.dart';
import 'package:lythaus/features/feed/domain/post_repository.dart';

class _Repository extends Mock implements PostRepository {}

void main() {
  setUpAll(
    () => registerFallbackValue(const CreatePostRequest(text: 'fallback')),
  );

  test('uncertain attempts reuse their key and reject changed payloads', () {
    final registry = ContentMutationRegistry();
    final original = registry.begin('comment:create:owner', {
      'body': 'original',
    });
    expect(
      () => registry.begin(original.scope, original.payload),
      throwsA(isA<ContentMutationFailure>()),
    );
    registry.finish(original, uncertain: true);
    expect(
      () => registry.begin(original.scope, {'body': 'changed'}),
      throwsA(isA<ContentMutationFailure>()),
    );
    final retry = registry.begin(original.scope, {'body': 'original'});
    expect(retry.key, original.key);
    registry.finish(retry);
    expect(registry.pending(original.scope), isNull);
  });

  test('known failures allow a fresh attempt and scopes isolate owners', () {
    final registry = ContentMutationRegistry();
    final a = registry.begin('post:owner-a:p1', {'method': 'DELETE'});
    final b = registry.begin('post:owner-b:p1', {'method': 'DELETE'});
    expect(a.key, isNot(b.key));
    registry.finish(a);
    expect(registry.begin(a.scope, a.payload).key, isNot(a.key));
  });

  test('pending edits prevent conflicting deletions', () {
    final registry = ContentMutationRegistry();
    final edit = registry.begin('post:owner:p1', {
      'method': 'PUT',
      'body': {'body': 'edit'},
    });
    registry.finish(edit, uncertain: true);
    expect(
      () => registry.begin(edit.scope, {'method': 'DELETE'}),
      throwsA(isA<ContentMutationFailure>()),
    );
  });

  test(
    'serialization preserves normalized disclosure and excludes replay keys',
    () {
      final create = const CreatePostRequest(
        text: 'An assisted contribution',
        aiLabel: ' Assisted ',
        idempotencyKey: 'replay-key',
      ).toJson();
      expect(create['declaredCreationMode'], 'ai_assisted');
      expect(create.containsKey('idempotencyKey'), isFalse);
      final edit = const UpdatePostRequest(
        text: 'An edit',
        aiLabel: ' HUMAN ',
        idempotencyKey: 'replay-key',
      ).toJson();
      expect(edit, {'body': 'An edit', 'declaredCreationMode': 'human'});
      expect(
        () => const UpdatePostRequest(aiLabel: 'generated').toJson(),
        throwsArgumentError,
      );
    },
  );

  for (final code in [
    'idempotency_in_progress',
    'idempotency_outcome_unknown',
    'idempotency_key_conflict',
  ]) {
    test('canonical string $code keeps the outcome uncertain', () {
      final failure = contentMutationFailure(
        DioException(
          requestOptions: RequestOptions(path: '/posts'),
          response: Response(
            data: {'error': code},
            statusCode: 409,
            requestOptions: RequestOptions(path: '/posts'),
          ),
        ),
      );
      expect(failure.code, code);
      expect(failure.uncertain, isTrue);
      expect(failure.message, contains('same submission'));
    });
  }

  test('canonical policy and permission failures are definitive', () {
    for (final status in [400, 403, 429]) {
      final failure = contentMutationFailure(
        DioException(
          requestOptions: RequestOptions(path: '/comments'),
          response: Response(
            data: {'error': 'invalid_post'},
            statusCode: status,
            requestOptions: RequestOptions(path: '/comments'),
          ),
        ),
      );
      expect(failure.uncertain, isFalse);
    }
  });

  test('post submit locks before token lookup and freezes the draft', () async {
    final token = Completer<String?>();
    final result = Completer<CreatePostResult>();
    final repository = _Repository();
    when(
      () => repository.createPost(
        request: any(named: 'request'),
        token: any(named: 'token'),
      ),
    ).thenAnswer((_) => result.future);
    final container = ProviderContainer(
      overrides: [
        contentRecoveryStorageProvider.overrideWithValue(
          MemoryContentRecoveryStorage(),
        ),
        currentUserProvider.overrideWithValue(null),
        jwtProvider.overrideWith((ref) => token.future),
        postRepositoryProvider.overrideWithValue(repository),
      ],
    );
    addTearDown(container.dispose);
    final notifier = container.read(postCreationProvider.notifier);
    notifier.updateText('Original synthetic post');
    notifier.setAiLabel('human');
    final first = notifier.submit();
    expect(container.read(postCreationProvider).isSubmitting, isTrue);
    notifier.updateText('Changed while awaiting token');
    expect(await notifier.submit(), isFalse);
    token.complete('synthetic-token');
    await Future<void>.delayed(Duration.zero);
    final request =
        verify(
              () => repository.createPost(
                request: captureAny(named: 'request'),
                token: 'synthetic-token',
              ),
            ).captured.single
            as CreatePostRequest;
    expect(request.text, 'Original synthetic post');
    expect(request.idempotencyKey, isNotEmpty);
    result.complete(
      const CreatePostError(message: 'Timeout', outcomeUncertain: true),
    );
    expect(await first, isFalse);
  });

  test(
    'post retry retains key, payload and draft despite reset attempts',
    () async {
      final requests = <CreatePostRequest>[];
      final repository = _Repository();
      when(
        () => repository.createPost(
          request: any(named: 'request'),
          token: any(named: 'token'),
        ),
      ).thenAnswer((invocation) async {
        requests.add(invocation.namedArguments[#request] as CreatePostRequest);
        return const CreatePostError(
          message: 'Unknown outcome',
          outcomeUncertain: true,
        );
      });
      final container = ProviderContainer(
        overrides: [
          contentRecoveryStorageProvider.overrideWithValue(
            MemoryContentRecoveryStorage(),
          ),
          currentUserProvider.overrideWithValue(null),
          jwtProvider.overrideWith((ref) async => 'synthetic-token'),
          postRepositoryProvider.overrideWithValue(repository),
        ],
      );
      addTearDown(container.dispose);
      final notifier = container.read(postCreationProvider.notifier);
      notifier.updateText('A preserved draft');
      notifier.setAiLabel('human');
      await notifier.submit();
      notifier.reset();
      notifier.clearError();
      notifier.updateText('A different draft');
      notifier.setAiLabel('assisted');
      await notifier.submit();
      expect(requests, hasLength(2));
      expect(requests[1].idempotencyKey, requests[0].idempotencyKey);
      expect(requests[1].toJson(), requests[0].toJson());
      expect(container.read(postCreationProvider).text, 'A preserved draft');
    },
  );

  test(
    'disposing during token lookup does not send or mutate disposed state',
    () async {
      final token = Completer<String?>();
      final repository = _Repository();
      final container = ProviderContainer(
        overrides: [
          contentRecoveryStorageProvider.overrideWithValue(
            MemoryContentRecoveryStorage(),
          ),
          currentUserProvider.overrideWithValue(null),
          jwtProvider.overrideWith((ref) => token.future),
          postRepositoryProvider.overrideWithValue(repository),
        ],
      );
      final notifier = container.read(postCreationProvider.notifier);
      notifier.updateText('A synthetic draft');
      notifier.setAiLabel('human');
      final submission = notifier.submit();
      container.dispose();
      token.complete('synthetic-token');
      expect(await submission, isFalse);
      verifyNever(
        () => repository.createPost(
          request: any(named: 'request'),
          token: any(named: 'token'),
        ),
      );
    },
  );
}
