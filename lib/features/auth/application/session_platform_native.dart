import 'package:http/http.dart' as http;

/// Native refresh credentials use the platform's secure storage.
http.Client createSessionClient() => http.Client();

/// Native concurrent requests are serialized by AuthService.
Future<T> withSessionLock<T>(Future<T> Function() action) => action();

/// Native sessions have no browser cookie to finish revoking.
bool pendingBrowserLogout() => false;

/// Browser logout markers are unnecessary on native platforms.
void markBrowserLogout(bool pending) {}

/// Native installations do not share browser tabs.
Stream<void> browserSignOutEvents() => const Stream.empty();
