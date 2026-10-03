// ignore_for_file: public_member_api_docs

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lythaus/features/auth/application/auth_providers.dart';

/// A synchronous revision preserves transitions that occur before Riverpod's
/// derived owner-ID providers are flushed, including A -> null -> A.
class AuthSessionRevision extends StateNotifier<int> {
  AuthSessionRevision(StateNotifier<Object?> source) : super(0) {
    _stop = source.addListener((_) {
      _revision++;
      for (final cancel in _cancellations.toList()) {
        cancel();
      }
      state = _revision;
    }, fireImmediately: false);
  }

  late final void Function() _stop;
  int _revision = 0;
  final _cancellations = <void Function()>{};
  int get revision => _revision;

  void Function() cancelOnChange(void Function() cancel) {
    _cancellations.add(cancel);
    return () => _cancellations.remove(cancel);
  }

  @override
  void dispose() {
    _revision++;
    for (final cancel in _cancellations.toList()) {
      cancel();
    }
    _cancellations.clear();
    _stop();
    super.dispose();
  }
}

final authSessionRevisionProvider =
    StateNotifierProvider<AuthSessionRevision, int>(
      (ref) => AuthSessionRevision(ref.watch(authStateProvider.notifier)),
    );
