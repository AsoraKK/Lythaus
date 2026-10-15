import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:lythaus/core/config/web_release_reload_gate.dart';
import 'package:lythaus/core/network/pending_authenticated_operations.dart';
import 'package:lythaus/features/feed/application/content_mutation.dart';
import 'package:lythaus/features/feed/application/content_recovery_storage.dart';

class _Storage implements ContentRecoveryStorage {
  final values = <String, String>{};
  final readsReleased = Completer<void>();
  bool holdReads = false;

  @override
  Future<String?> read(String key) async {
    if (holdReads) await readsReleased.future;
    return values[key];
  }

  @override
  Future<void> write(String key, String value) async {
    values[key] = value;
  }
}

void main() {
  test(
    'dirty, focused, auth-loading and pending work close the bridge',
    () async {
      final registry = ContentMutationRegistry()..activate(null);
      await registry.ready;
      final operations = PendingAuthenticatedOperations();
      final bridgeValues = <bool>[];
      var postCanReload = true;
      var hasFocusedText = false;
      var authLoading = false;
      final gate = WebReleaseReloadGate(
        registry: registry,
        authSessionRevision: () => 0,
        authLoading: () => authLoading,
        hasPendingAuthenticatedWork: () => operations.hasPending,
        postCanSafelyReload: () => postCanReload,
        hasFocusedTextEntry: () => hasFocusedText,
        setCanReload: bridgeValues.add,
      );

      await gate.schedule();
      expect(bridgeValues.last, isTrue);
      postCanReload = false;
      await gate.schedule();
      expect(bridgeValues.last, isFalse);
      postCanReload = true;
      hasFocusedText = true;
      await gate.schedule();
      expect(bridgeValues.last, isFalse);
      hasFocusedText = false;
      authLoading = true;
      await gate.schedule();
      expect(bridgeValues.last, isFalse);
      authLoading = false;
      final operation = operations.beginOperation();
      await gate.schedule();
      expect(bridgeValues.last, isFalse);
      operations.finishOperation(operation);
      await gate.schedule();
      expect(bridgeValues.last, isTrue);

      gate.dispose();
      expect(bridgeValues.last, isFalse);
    },
  );

  test(
    'session change during journal flush cannot open the stale gate',
    () async {
      final storage = _Storage()..holdReads = true;
      final registry = ContentMutationRegistry(storage: storage)
        ..activate('account-a');
      var authRevision = 0;
      final bridgeValues = <bool>[];
      final gate = WebReleaseReloadGate(
        registry: registry,
        authSessionRevision: () => authRevision,
        authLoading: () => false,
        hasPendingAuthenticatedWork: () => false,
        postCanSafelyReload: () => true,
        hasFocusedTextEntry: () => false,
        setCanReload: bridgeValues.add,
      );

      final staleSync = gate.schedule();
      expect(bridgeValues, [false]);
      authRevision++;
      registry.activate('account-b');
      storage.holdReads = false;
      storage.readsReleased.complete();
      await registry.ready;
      await staleSync;
      expect(bridgeValues, [false]);

      await gate.schedule();
      expect(bridgeValues.last, isTrue);
      gate.dispose();
    },
  );
}
