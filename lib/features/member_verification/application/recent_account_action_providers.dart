// ignore_for_file: public_member_api_docs

import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lythaus/core/network/dio_client.dart';
import 'package:lythaus/features/auth/application/auth_providers.dart';
import 'package:lythaus/features/auth/application/auth_session_revision.dart';
import 'package:lythaus/features/member_verification/application/account_action_transport.dart'
    if (dart.library.html) 'account_action_transport_web.dart';
import 'package:lythaus/features/member_verification/application/recent_account_action.dart';

final recentAccountActionClientEnabledProvider = Provider<bool>(
  (_) => const bool.fromEnvironment(
    'MEMBER_RECENT_AUTH_CLIENT_ENABLED',
    defaultValue: false,
  ),
);

final recentAccountActionClientProvider = Provider.autoDispose
    .family<RecentAccountActionClient, int>((ref, revision) {
      final session = ref.watch(authSessionRevisionProvider.notifier);
      final cancellation = CancelToken();
      final stop = session.cancelOnChange(
        () => cancellation.cancel('session_changed'),
      );
      ref.onDispose(stop);
      ref.onDispose(() => cancellation.cancel('action_disposed'));
      final auth = ref.watch(enhancedAuthServiceProvider);
      final dio = accountActionTransport(ref.watch(secureDioProvider));
      ref.onDispose(() => disposeAccountActionTransport(dio));
      return RecentAccountActionClient(
        dio: dio,
        sessionHeaders: auth.accountActionSessionHeaders,
        isCurrent: () =>
            session.revision == revision &&
            ref.read(currentUserProvider) != null,
        sessionCancellation: cancellation,
      );
    });
