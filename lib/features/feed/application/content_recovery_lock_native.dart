// ignore_for_file: public_member_api_docs
final _tails = Expando<Future<void>>();
Future<T> withContentRecoveryLock<T>(
  Object owner,
  Future<T> Function() action,
) {
  final result = (_tails[owner] ?? Future<void>.value()).then((_) => action());
  _tails[owner] = result.then<void>(
    (_) {},
    onError: (Object _, StackTrace __) {},
  );
  return result;
}
