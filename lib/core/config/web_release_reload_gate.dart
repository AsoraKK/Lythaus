// ignore_for_file: public_member_api_docs

import 'dart:async';

import 'package:lythaus/features/feed/application/content_mutation.dart';

class WebReleaseReloadGate {
  WebReleaseReloadGate({
    required ContentMutationRegistry registry,
    required int Function() authSessionRevision,
    required bool Function() authLoading,
    required bool Function() hasPendingAuthenticatedWork,
    required bool Function() postCanSafelyReload,
    required bool Function() hasFocusedTextEntry,
    required void Function(bool) setCanReload,
    this.journalTimeout = const Duration(seconds: 5),
  }) : _registry = registry,
       _authSessionRevision = authSessionRevision,
       _authLoading = authLoading,
       _hasPendingAuthenticatedWork = hasPendingAuthenticatedWork,
       _postCanSafelyReload = postCanSafelyReload,
       _hasFocusedTextEntry = hasFocusedTextEntry,
       _setCanReload = setCanReload;

  final ContentMutationRegistry _registry;
  final int Function() _authSessionRevision;
  final bool Function() _authLoading;
  final bool Function() _hasPendingAuthenticatedWork;
  final bool Function() _postCanSafelyReload;
  final bool Function() _hasFocusedTextEntry;
  final void Function(bool) _setCanReload;
  final Duration journalTimeout;
  int _generation = 0;
  bool _disposed = false;

  Future<void> schedule() {
    if (_disposed) return Future<void>.value();
    _setCanReload(false);
    return _sync(++_generation);
  }

  Future<void> _sync(int generation) async {
    final authRevision = _authSessionRevision();
    final registryEpoch = _registry.sessionEpoch;
    try {
      await _registry.flushPendingJournalWrites().timeout(journalTimeout);
    } catch (_) {
      return;
    }
    if (_disposed ||
        generation != _generation ||
        authRevision != _authSessionRevision() ||
        registryEpoch != _registry.sessionEpoch) {
      return;
    }

    _setCanReload(
      !_authLoading() &&
          !_hasFocusedTextEntry() &&
          _registry.canSafelyReload &&
          !_hasPendingAuthenticatedWork() &&
          _postCanSafelyReload(),
    );
  }

  void dispose() {
    if (_disposed) return;
    _disposed = true;
    _generation++;
    _setCanReload(false);
  }
}
