import 'dart:async';
import 'dart:convert';
import 'package:flutter_test/flutter_test.dart';
import 'package:lythaus/features/feed/application/content_mutation.dart';
import 'package:lythaus/features/feed/application/content_recovery_storage.dart';
import '../../../helpers/content_recovery.dart';

const payload = {
  'body': 'Private synthetic text',
  'declaredCreationMode': 'human',
  'geoScope': 'none',
};

class _PausedStorage extends MemoryContentRecoveryStorage {
  Completer<void>? pause;
  @override
  Future<void> write(String key, String value) async {
    await pause?.future;
    return super.write(key, value);
  }
}

class _ReadPause {
  final started = Completer<void>();
  final release = Completer<void>();
}

class _PausedReadStorage extends MemoryContentRecoveryStorage {
  _ReadPause? _pause;

  _ReadPause pauseNextRead() => _pause = _ReadPause();

  @override
  Future<String?> read(String key) async {
    final pause = _pause;
    _pause = null;
    final value = await super.read(key);
    if (pause != null) {
      pause.started.complete();
      await pause.release.future;
    }
    return value;
  }
}

Future<ContentMutationRegistry> open(
  ContentRecoveryStorage storage,
  String? actor, {
  DateTime Function()? clock,
}) async {
  final registry = ContentMutationRegistry(storage: storage, clock: clock);
  registry.activate(actor);
  await registry.ready;
  addTearDown(registry.dispose);
  return registry;
}

void main() {
  test(
    'frozen payloads cannot be changed through the caller or nested maps',
    () {
      final nested = <String, dynamic>{'body': 'Original'};
      final registry = ContentMutationRegistry();
      final attempt = registry.begin('post:a:p1', {
        'method': 'PUT',
        'body': nested,
      });
      nested['body'] = 'Changed';
      expect((attempt.payload['body'] as Map)['body'], 'Original');
      expect(
        () => (attempt.payload['body'] as Map)['body'] = 'Changed',
        throwsUnsupportedError,
      );
      registry.dispose();
    },
  );

  test(
    'an authentication rejection on a replay preserves the earlier unresolved key',
    () async {
      final storage = MemoryContentRecoveryStorage();
      final registry = await open(storage, 'a');
      final original = await registry.beginDurable('post-create:a', payload);
      await registry.finishDurable(original, uncertain: true);
      final retry = await registry.beginDurable(original.scope, payload);
      await registry.finishDurable(retry, uncertain: false);
      final reopened = await open(storage, 'a');
      expect(reopened.pending(original.scope)!.key, original.key);
      await expectLater(
        reopened.beginDurable(original.scope, {
          ...payload,
          'body': 'a new draft',
        }),
        throwsA(isA<ContentMutationFailure>()),
      );
    },
  );
  test(
    'a restarted process restores a draft and the exact frozen replay request',
    () async {
      final storage = MemoryContentRecoveryStorage();
      final first = await open(storage, 'a');
      await first.saveDraft('post-create:a', payload);
      final attempt = await first.beginDurable('post-create:a', payload);
      await first.finishDurable(attempt, uncertain: true);
      final second = await open(storage, 'a');
      expect(second.draft('post-create:a'), payload);
      final retry = await second.beginDurable('post-create:a', payload);
      expect(retry.key, attempt.key);
      expect(retry.payload, payload);
      expect(second.pending(attempt.scope)!.inFlight, isTrue);
    },
  );

  test(
    'no HTTP caller receives an attempt before its journal write succeeds',
    () async {
      final storage = _PausedStorage();
      final registry = await open(storage, 'a');
      storage.pause = Completer<void>();
      var released = false;
      final begin = registry.beginDurable('post-create:a', payload).then((a) {
        released = true;
        return a;
      });
      await Future<void>.delayed(Duration.zero);
      expect(released, isFalse);
      storage.pause!.complete();
      expect((await begin).key, isNotEmpty);
      expect(storage.values.values.single, contains('Private synthetic text'));
    },
  );

  test(
    'storage failures and corrupt journals fail closed before a request',
    () async {
      final storage = MemoryContentRecoveryStorage();
      final registry = await open(storage, 'a');
      storage.failWrites = true;
      await expectLater(
        registry.beginDurable('post-create:a', payload),
        throwsA(
          isA<ContentMutationFailure>().having(
            (e) => e.message,
            'message',
            contains('No new request'),
          ),
        ),
      );
      storage.failWrites = false;
      storage.values.updateAll((_, __) => '{"version":9000}');
      final corrupt = await open(storage, 'a');
      expect(corrupt.storageUnavailable, isTrue);
      await expectLater(
        corrupt.beginDurable('post-create:a', payload),
        throwsA(isA<ContentMutationFailure>()),
      );
    },
  );

  test(
    'independent tab journals reuse the same key instead of starting a duplicate',
    () async {
      final storage = MemoryContentRecoveryStorage();
      final first = await open(storage, 'a');
      final second = await open(storage, 'a');
      final requests = await Future.wait([
        first.beginDurable('post-create:a', payload),
        second.beginDurable('post-create:a', payload),
      ]);
      expect(requests[0].key, requests[1].key);
    },
  );

  test(
    'logout clears raw text and another account cannot restore it',
    () async {
      final storage = MemoryContentRecoveryStorage();
      final first = await open(storage, 'a');
      await first.saveDraft('post-create:a', payload);
      final attempt = await first.beginDurable('post-create:a', payload);
      await first.finishDurable(attempt, uncertain: true);
      first.activate(null);
      expect(first.pending(attempt.scope), isNull);
      expect(first.draft(attempt.scope), isNull);
      await first.ready;
      expect(
        storage.values.values.join(),
        isNot(contains('Private synthetic text')),
      );
      final other = await open(storage, 'b');
      expect(other.attempts, isEmpty);
      expect(other.owned, isEmpty);
      await expectLater(
        other.beginDurable('post-create:a', payload),
        throwsA(isA<ContentMutationFailure>()),
      );
      final original = await open(storage, 'a');
      expect(original.pending(attempt.scope)!.needsReentry, isTrue);
      await expectLater(
        original.beginDurable(attempt.scope, {...payload, 'body': 'different'}),
        throwsA(isA<ContentMutationFailure>()),
      );
      expect(
        (await original.beginDurable(attempt.scope, payload)).key,
        attempt.key,
      );
    },
  );

  test(
    '24-hour drafts expire and seven-day retry text becomes a fingerprint hold',
    () async {
      final storage = MemoryContentRecoveryStorage();
      var now = DateTime.utc(2026, 10, 2);
      final first = await open(storage, 'a', clock: () => now);
      await first.saveDraft('comment-create:a:p1', payload);
      final attempt = await first.beginDurable('post:a:p1', {
        'method': 'PUT',
        'body': {'body': 'Sensitive edit', 'declaredCreationMode': 'human'},
      });
      await first.finishDurable(attempt, uncertain: true);
      now = now.add(const Duration(days: 8));
      final restored = await open(storage, 'a', clock: () => now);
      expect(restored.draft('comment-create:a:p1'), isNull);
      expect(restored.pending(attempt.scope)!.needsReentry, isTrue);
      expect(storage.values.values.join(), isNot(contains('Sensitive edit')));
      expect(
        storage.values.values.join(),
        isNot(contains('Private synthetic text')),
      );
      expect(
        (await restored.beginDurable(attempt.scope, attempt.payload)).key,
        attempt.key,
      );
    },
  );

  for (final entry in {
    'post-create:a': payload,
    'post:a:p1': {
      'method': 'PUT',
      'body': {
        'body': 'Sensitive replay edit',
        'declaredCreationMode': 'human',
      },
    },
  }.entries) {
    test(
      'replaying ${entry.key} preserves the original seven-day expiry',
      () async {
        final storage = MemoryContentRecoveryStorage();
        final start = DateTime.utc(2026, 10, 2);
        var now = start;
        final registry = await open(storage, 'a', clock: () => now);
        final original = await registry.beginDurable(entry.key, entry.value);
        await registry.finishDurable(original, uncertain: true);

        now = start.add(const Duration(days: 6));
        final retry = await registry.beginDurable(entry.key, entry.value);
        expect(retry.key, original.key);
        expect(
          retry.expiresAt.millisecondsSinceEpoch,
          original.expiresAt.millisecondsSinceEpoch,
        );
        await registry.finishDurable(retry, uncertain: true);

        now = start.add(const Duration(days: 8));
        final reopened = await open(storage, 'a', clock: () => now);
        final held = reopened.pending(entry.key)!;
        expect(held.needsReentry, isTrue);
        expect(held.key, original.key);
        expect(held.fingerprint, original.fingerprint);
        expect(
          held.expiresAt.millisecondsSinceEpoch,
          original.expiresAt.millisecondsSinceEpoch,
        );
        expect(
          storage.values.values.join(),
          isNot(contains('Private synthetic text')),
        );
        expect(
          storage.values.values.join(),
          isNot(contains('Sensitive replay edit')),
        );
      },
    );
  }

  test(
    'a late acknowledgement after logout and same-account sign-in preserves the new draft',
    () async {
      final storage = MemoryContentRecoveryStorage();
      final registry = await open(storage, 'a');
      final attempt = await registry.beginDurable('post-create:a', payload);
      registry.activate(null);
      await registry.ready;
      registry.activate('a');
      await registry.ready;
      await registry.saveDraft(attempt.scope, {
        'body': 'Current session draft',
        'declaredCreationMode': 'human',
      });
      await registry.finishDurable(
        attempt,
        receipt: const OwnedContent('post', 'p1'),
      );
      expect(registry.pending(attempt.scope)!.key, attempt.key);
      expect(registry.pending(attempt.scope)!.needsReentry, isTrue);
      expect(registry.draft(attempt.scope)!['body'], 'Current session draft');
      expect(registry.owned, isEmpty);
      final restored = await open(storage, 'a');
      expect(restored.pending(attempt.scope)!.key, attempt.key);
      expect(restored.draft(attempt.scope)!['body'], 'Current session draft');
      expect(restored.owned, isEmpty);
    },
  );

  test(
    'reopening a composer in a long-lived session expires cached and stored text',
    () async {
      final storage = MemoryContentRecoveryStorage();
      var now = DateTime.utc(2026, 10, 2);
      final registry = await open(storage, 'a', clock: () => now);
      await registry.saveDraft('post-create:a', payload);
      final attempt = await registry.beginDurable('post-create:a', payload);
      await registry.finishDurable(attempt, uncertain: true);
      now = now.add(const Duration(days: 8));
      await registry.refresh();
      expect(registry.draft(attempt.scope), isNull);
      expect(registry.pending(attempt.scope)!.key, attempt.key);
      expect(registry.pending(attempt.scope)!.needsReentry, isTrue);
      expect(
        storage.values.values.join(),
        isNot(contains('Private synthetic text')),
      );
      expect(
        (await registry.beginDurable(attempt.scope, payload)).key,
        attempt.key,
      );
    },
  );

  test(
    'an expired journal erases text even when a conflicting replay is rejected',
    () async {
      final storage = MemoryContentRecoveryStorage();
      var now = DateTime.utc(2026, 10, 2);
      final registry = await open(storage, 'a', clock: () => now);
      await registry.saveDraft('post-create:a', payload);
      final attempt = await registry.beginDurable('post-create:a', payload);
      await registry.finishDurable(attempt, uncertain: true);
      now = now.add(const Duration(days: 8));
      await expectLater(
        registry.beginDurable(attempt.scope, {...payload, 'body': 'different'}),
        throwsA(isA<ContentMutationFailure>()),
      );
      expect(
        storage.values.values.join(),
        isNot(contains('Private synthetic text')),
      );
      final restored = await open(storage, 'a', clock: () => now);
      expect(restored.pending(attempt.scope)!.key, attempt.key);
      expect(restored.pending(attempt.scope)!.needsReentry, isTrue);
      expect(restored.draft(attempt.scope), isNull);
    },
  );

  test(
    'saved success atomically removes the draft and records only its owned ID',
    () async {
      final storage = MemoryContentRecoveryStorage();
      final registry = await open(storage, 'a');
      await registry.saveDraft('comment-create:a:p1', payload);
      final attempt = await registry.beginDurable(
        'comment-create:a:p1',
        payload,
      );
      await registry.finishDurable(
        attempt,
        receipt: const OwnedContent('comment', 'c1', postId: 'p1'),
      );
      final restored = await open(storage, 'a');
      expect(restored.attempts, isEmpty);
      expect(restored.draft(attempt.scope), isNull);
      expect(restored.owned.single.toJson(), {
        'kind': 'comment',
        'id': 'c1',
        'postId': 'p1',
      });
      expect(jsonDecode(storage.values.values.single)['owned'], [
        restored.owned.single.toJson(),
      ]);
      expect(
        storage.values.values.single,
        isNot(contains('Private synthetic text')),
      );
    },
  );

  test(
    'an acknowledgement storage failure keeps the same retry key after restart',
    () async {
      final storage = MemoryContentRecoveryStorage();
      final registry = await open(storage, 'a');
      final attempt = await registry.beginDurable('post-create:a', payload);
      storage.failWrites = true;
      await expectLater(
        registry.finishDurable(
          attempt,
          receipt: const OwnedContent('post', 'p1'),
        ),
        throwsA(
          isA<ContentMutationFailure>().having(
            (e) => e.uncertain,
            'uncertain',
            isTrue,
          ),
        ),
      );
      storage.failWrites = false;
      final restored = await open(storage, 'a');
      expect(
        (await restored.beginDurable(attempt.scope, payload)).key,
        attempt.key,
      );
    },
  );

  test(
    'a definitive rejection preserves the unsent draft for correction',
    () async {
      final storage = MemoryContentRecoveryStorage();
      final registry = await open(storage, 'a');
      await registry.saveDraft('post-create:a', payload);
      final attempt = await registry.beginDurable('post-create:a', payload);
      await registry.finishDurable(attempt);
      final restored = await open(storage, 'a');
      expect(restored.pending(attempt.scope), isNull);
      expect(restored.draft(attempt.scope), payload);
    },
  );

  test(
    'interrupted deletes remain replayable without private body text',
    () async {
      final storage = MemoryContentRecoveryStorage();
      final registry = await open(storage, 'a');
      final attempt = await registry.beginDurable('comment:a:c1', {
        'method': 'DELETE',
        'postId': 'p1',
      });
      final restored = await open(storage, 'a');
      final retry = await restored.beginDurable(attempt.scope, attempt.payload);
      expect(retry.key, attempt.key);
      expect(retry.needsReentry, isFalse);
      await restored.finishDurable(
        retry,
        deleted: true,
        receipt: const OwnedContent('comment', 'c1', postId: 'p1'),
      );
      expect(restored.attempts, isEmpty);
    },
  );

  test(
    'logout while a journal write is paused fences the caller and sanitizes storage',
    () async {
      final storage = _PausedStorage();
      final registry = await open(storage, 'a');
      storage.pause = Completer<void>();
      final begin = registry.beginDurable('post-create:a', payload);
      final failure = expectLater(
        begin,
        throwsA(isA<ContentMutationFailure>()),
      );
      await Future<void>.delayed(Duration.zero);
      registry.activate(null);
      storage.pause!.complete();
      await failure;
      await registry.ready;
      expect(
        storage.values.values.join(),
        isNot(contains('Private synthetic text')),
      );
      expect(registry.attempts, isEmpty);
    },
  );

  for (final nextActor in <String?>[null, 'b', 'a']) {
    final transition = nextActor == 'a'
        ? 'logout and same-account sign-in'
        : 'switching to $nextActor';
    test(
      'a paused journal read cannot restore private text after $transition',
      () async {
        final storage = _PausedReadStorage();
        final registry = await open(storage, 'a');
        const scope = 'post-create:a';
        await registry.saveDraft(scope, payload);
        final original = await registry.beginDurable(scope, payload);
        await registry.finishDurable(original, uncertain: true);
        final acknowledged = await registry.beginDurable(
          'comment-create:a:p1',
          payload,
        );
        await registry.finishDurable(
          acknowledged,
          receipt: const OwnedContent('comment', 'c1', postId: 'p1'),
        );

        final read = storage.pauseNextRead();
        final begin = registry.beginDurable(scope, payload);
        final rejected = expectLater(
          begin,
          throwsA(isA<ContentMutationFailure>()),
        );
        await read.started.future;
        if (nextActor == 'a') registry.activate(null);
        registry.activate(nextActor);
        expect(registry.draft(scope), isNull);
        expect(registry.attempts, isEmpty);
        expect(registry.owned, isEmpty);

        final cleanup = storage.pauseNextRead();
        addTearDown(() {
          if (!read.release.isCompleted) read.release.complete();
          if (!cleanup.release.isCompleted) cleanup.release.complete();
        });
        read.release.complete();
        await rejected;
        await cleanup.started.future;
        expect(registry.draft(scope), isNull);
        expect(registry.attempts, isEmpty);
        expect(registry.owned, isEmpty);

        cleanup.release.complete();
        await registry.ready;
        expect(registry.draft(scope), isNull);
        if (nextActor == 'a') {
          expect(registry.pending(scope)!.key, original.key);
          expect(registry.pending(scope)!.needsReentry, isTrue);
          expect(registry.owned.single.id, 'c1');
        } else {
          expect(registry.attempts, isEmpty);
          expect(registry.owned, isEmpty);
        }
        expect(
          storage.values.values.join(),
          isNot(contains('Private synthetic text')),
        );
        final reopened = await open(storage, 'a');
        expect(reopened.pending(scope)!.key, original.key);
        expect(reopened.pending(scope)!.needsReentry, isTrue);
        expect(reopened.draft(scope), isNull);
        expect(reopened.owned.single.id, 'c1');
      },
    );
  }
}
