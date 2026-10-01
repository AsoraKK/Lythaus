import 'dart:async';
import 'dart:js_interop';

import 'package:http/browser_client.dart';
import 'package:http/http.dart' as http;
import 'package:web/web.dart' as web;

/// Cookies are carried by the browser, never returned to Dart storage.
http.Client createSessionClient() => BrowserClient()..withCredentials = true;

const _logoutMarker = 'lythaus-session-logout-pending';
bool _pendingInMemory = false;

/// A nonsensitive marker prevents an offline sign-out from restoring a cookie.
bool pendingBrowserLogout() {
  try {
    return _pendingInMemory ||
        web.window.localStorage.getItem(_logoutMarker) != null;
  } catch (_) {
    return _pendingInMemory;
  }
}

/// No credential or identity is written to Web Storage.
void markBrowserLogout(bool pending) {
  _pendingInMemory = pending;
  try {
    if (pending) {
      web.window.localStorage.setItem(
        _logoutMarker,
        DateTime.now().microsecondsSinceEpoch.toString(),
      );
    } else {
      web.window.localStorage.removeItem(_logoutMarker);
    }
  } catch (_) {}
}

/// Other tabs discard private state as soon as sign-out starts.
Stream<void> browserSignOutEvents() => Stream<void>.multi((sink) {
  final listener = ((web.Event event) {
    final storage = event as web.StorageEvent;
    if (storage.key == _logoutMarker && storage.newValue != null) {
      sink.add(null);
    }
  }).toJS;
  web.window.addEventListener('storage', listener);
  sink.onCancel = () => web.window.removeEventListener('storage', listener);
});

/// Serialize cookie rotation with other tabs on the application origin.
Future<T> withSessionLock<T>(Future<T> Function() action) async {
  late T result;
  Object? failure;
  StackTrace? trace;
  await web.window.navigator.locks
      .request(
        'lythaus-auth-session-v1',
        web.LockOptions(signal: web.AbortSignal.timeout(45000)),
        ((JSAny? _) {
          return (() async {
            try {
              result = await action();
            } catch (error, stack) {
              failure = error;
              trace = stack;
            }
            return null;
          })().toJS;
        }).toJS,
      )
      .toDart;
  if (failure != null) Error.throwWithStackTrace(failure!, trace!);
  return result;
}
