// ignore_for_file: public_member_api_docs
import 'dart:js_interop';
import 'package:web/web.dart' as web;

Future<T> withContentRecoveryLock<T>(
  Object owner,
  Future<T> Function() action,
) async {
  late T result;
  Object? failure;
  StackTrace? trace;
  await web.window.navigator.locks
      .request(
        'lythaus-content-recovery-v1',
        web.LockOptions(signal: web.AbortSignal.timeout(45000)),
        ((JSAny? _) => (() async {
          try {
            result = await action();
          } catch (error, stack) {
            failure = error;
            trace = stack;
          }
          return null;
        })().toJS).toJS,
      )
      .toDart;
  if (failure != null) Error.throwWithStackTrace(failure!, trace!);
  return result;
}
