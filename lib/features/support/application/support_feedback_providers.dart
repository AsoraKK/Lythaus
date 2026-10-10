// ignore_for_file: public_member_api_docs

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lythaus/core/network/dio_client.dart';
import 'package:lythaus/features/auth/application/auth_providers.dart';
import 'package:lythaus/features/auth/application/auth_session_revision.dart';
import 'package:lythaus/features/support/application/support_feedback_api.dart';

final supportFeedbackClientProvider =
    Provider.autoDispose<SupportFeedbackClient>((ref) {
      final revision = ref.watch(authSessionRevisionProvider);
      final session = ref.read(authSessionRevisionProvider.notifier);
      final client = DioSupportFeedbackClient(
        dio: ref.watch(secureDioProvider),
        accessToken: () => ref.read(jwtProvider.future),
        isCurrentSession: () => session.revision == revision,
      );
      final stop = session.cancelOnChange(client.cancelPending);
      ref.onDispose(stop);
      ref.onDispose(client.cancelPending);
      return client;
    });
