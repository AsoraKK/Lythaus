// ignore_for_file: public_member_api_docs

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lythaus/features/auth/application/auth_providers.dart';
import 'package:lythaus/features/auth/application/auth_session_revision.dart';
import 'package:lythaus/features/auth/domain/auth_required_exception.dart';

final feedReadSessionProvider = Provider<FeedReadSession>((ref) {
  final auth = ref.watch(authStateProvider);
  final revision = ref.watch(authSessionRevisionProvider);
  final tokenVersion = ref.watch(tokenVersionProvider);
  final isGuest = ref.watch(guestModeProvider);
  final source = ref.read(authSessionRevisionProvider.notifier);
  final tokenSource = ref.read(tokenVersionProvider.notifier);
  final user = auth.asData?.value;
  final authenticated = !isGuest && user != null && !user.isTemporary;
  final session = FeedReadSession._(
    source: source,
    revision: revision,
    tokenSource: tokenSource,
    tokenVersion: tokenVersion,
    isLoading: auth.isLoading,
    hasError: auth.hasError,
    isAuthenticated: authenticated,
    isGuest: isGuest,
    token: authenticated
        ? ref.watch(jwtProvider.future)
        : Future<String?>.value(),
  );
  final stopSession = source.cancelOnChange(session.invalidate);
  ref.listen(tokenVersionProvider, (_, _) => session.invalidate());
  ref.onDispose(stopSession);
  ref.onDispose(session.invalidate);
  return session;
});

class FeedReadSession {
  FeedReadSession._({
    required AuthSessionRevision source,
    required int revision,
    required StateController<int> tokenSource,
    required int tokenVersion,
    required Future<String?> token,
    required this.isLoading,
    required this.hasError,
    required this.isAuthenticated,
    required this.isGuest,
  }) : _source = source,
       _revision = revision,
       _tokenSource = tokenSource,
       _tokenVersion = tokenVersion,
       _token = token;

  final AuthSessionRevision _source;
  final int _revision;
  final StateController<int> _tokenSource;
  final int _tokenVersion;
  final Future<String?> _token;
  final bool isLoading;
  final bool hasError;
  final bool isAuthenticated;
  final bool isGuest;
  final _listeners = <void Function()>{};
  bool _active = true;

  bool get isCurrent =>
      _active &&
      _source.revision == _revision &&
      _tokenSource.state == _tokenVersion;

  bool get canRead => isAuthenticated || isGuest;

  Future<String?> readToken() async {
    requireCurrent();
    if (isGuest && !isAuthenticated) return null;
    if (isLoading || hasError) throw const AuthRequiredException();
    if (!canRead) throw const AuthRequiredException();
    String? token;
    try {
      token = await _token;
    } catch (_) {
      throw const AuthRequiredException();
    }
    requireCurrent();
    if (isAuthenticated && (token == null || token.isEmpty)) {
      throw const AuthRequiredException();
    }
    return token;
  }

  void requireCurrent() {
    if (!isCurrent) throw const AuthRequiredException();
  }

  void Function() onInvalidated(void Function() listener) {
    if (!isCurrent) {
      listener();
      return () {};
    }
    _listeners.add(listener);
    return () => _listeners.remove(listener);
  }

  void invalidate() {
    if (!_active) return;
    _active = false;
    final listeners = _listeners.toList();
    _listeners.clear();
    for (final listener in listeners) {
      listener();
    }
  }
}
