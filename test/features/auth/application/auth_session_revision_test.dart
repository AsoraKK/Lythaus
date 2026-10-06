import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lythaus/features/auth/application/auth_session_revision.dart';

void main() {
  test(
    'raw auth transitions cancel synchronously before derived provider flush',
    () {
      final auth = StateController<AsyncValue<String?>>(
        const AsyncValue.data('a'),
      );
      final revision = AuthSessionRevision(auth);
      addTearDown(auth.dispose);
      addTearDown(revision.dispose);
      final events = <int>[];
      late void Function() stop;
      stop = revision.cancelOnChange(() {
        events.add(revision.revision);
        stop();
      });
      auth.state = const AsyncValue.data(null);
      auth.state = const AsyncValue.data('a');
      expect(revision.revision, 2);
      expect(events, [1]);
    },
  );

  test('replacement and disposal invalidate previously captured revision', () {
    final auth = StateController<AsyncValue<String?>>(
      const AsyncValue.data('a'),
    );
    final revision = AuthSessionRevision(auth);
    final captured = revision.revision;
    auth.state = const AsyncValue.loading();
    auth.state = const AsyncValue.data('b');
    expect(revision.revision, isNot(captured));
    var cancelled = false;
    revision.cancelOnChange(() => cancelled = true);
    revision.dispose();
    expect(cancelled, isTrue);
    auth.dispose();
  });
}
