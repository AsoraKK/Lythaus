// ignore_for_file: public_member_api_docs
import 'dart:async';

import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lythaus/core/network/dio_client.dart';
import 'package:lythaus/features/auth/application/auth_providers.dart';
import 'package:lythaus/features/feed/application/content_mutation.dart';
import 'package:lythaus/features/feed/application/feed_read_session.dart';
import 'package:lythaus/features/reactions/domain/contribution_feedback.dart';

// The candidate cannot be switched on by a production build configuration.
// A coordinated release must replace this gate after schema and privacy review.
final contributionFeedbackCandidateProvider = Provider<bool>((ref) => false);

final contributionFeedbackServiceProvider = Provider(
  (ref) => ContributionFeedbackService(ref.watch(secureDioProvider)),
);

final contributionFeedbackProvider = StateNotifierProvider.autoDispose
    .family<
      ContributionFeedbackController,
      ContributionFeedbackState,
      FeedbackTarget
    >((ref, target) {
      final session = ref.watch(feedReadSessionProvider);
      final controller = ContributionFeedbackController(
        ref.read(contributionFeedbackServiceProvider),
        session,
        target,
        ref.read(contentMutationRegistryProvider),
        ref.watch(currentUserProvider)?.id,
      );
      if (ref.watch(contributionFeedbackCandidateProvider) && session.canRead) {
        unawaited(controller.initialize());
      }
      return controller;
    });

class ContributionFeedbackService {
  ContributionFeedbackService(this.dio);
  final Dio dio;

  String _path(FeedbackTarget target) =>
      '/feedback/${target.type.name}/${Uri.encodeComponent(target.id)}';

  Options _options(String? token, {String? key}) => Options(
    headers: {
      if (token != null) 'Authorization': 'Bearer $token',
      if (key != null) 'Idempotency-Key': key,
    },
  );

  Future<ContributionFeedbackSummary> read(
    FeedbackTarget target,
    String? token,
  ) async {
    final response = await dio.get<Map<String, dynamic>>(
      _path(target),
      options: _options(token),
    );
    if (response.data == null) throw const FormatException('Missing feedback');
    return ContributionFeedbackSummary.fromJson(response.data!, target);
  }

  Future<void> change(
    FeedbackTarget target,
    FeedbackChannel channel,
    String? value,
    String token,
    String key,
  ) async {
    final response = await dio.put<Map<String, dynamic>>(
      '${_path(target)}/${channel.name}',
      data: {'value': value},
      options: _options(token, key: key),
    );
    final data = response.data;
    final responseTarget = data?['target'];
    if (data == null ||
        !data.containsKey('value') ||
        responseTarget is! Map ||
        responseTarget['type'] != target.type.name ||
        responseTarget['id'] is! String ||
        (responseTarget['id'] as String).toLowerCase() !=
            target.id.toLowerCase() ||
        data['channel'] != channel.name ||
        data['value'] != value ||
        data['changed'] is! bool) {
      throw const FormatException('Feedback change not confirmed');
    }
  }
}

class ContributionFeedbackState {
  const ContributionFeedbackState({
    this.summary,
    this.loading = false,
    this.busy = false,
    this.recoveryChannel,
    this.needsReentry = false,
    this.error,
  });
  final ContributionFeedbackSummary? summary;
  final bool loading;
  final bool busy;
  final FeedbackChannel? recoveryChannel;
  final bool needsReentry;
  final String? error;
}

class ContributionFeedbackController
    extends StateNotifier<ContributionFeedbackState> {
  ContributionFeedbackController(
    this._service,
    this._session,
    this.target,
    this._registry,
    this._actor,
  ) : super(const ContributionFeedbackState(loading: true));
  final ContributionFeedbackService _service;
  final FeedReadSession _session;
  final FeedbackTarget target;
  final ContentMutationRegistry _registry;
  final String? _actor;

  String _scope(FeedbackChannel channel) =>
      'feedback:$_actor:${target.type.name}:${target.id.toLowerCase()}:${channel.name}';

  ContentMutationAttempt? get _pending {
    if (_actor == null) return null;
    for (final channel in FeedbackChannel.values) {
      final attempt = _registry.pending(_scope(channel));
      if (attempt != null) return attempt;
    }
    return null;
  }

  FeedbackChannel? _pendingChannel(ContentMutationAttempt? pending) {
    if (pending == null) return null;
    return FeedbackChannel.values.firstWhere(
      (channel) => pending.scope == _scope(channel),
    );
  }

  Future<void> initialize() async {
    await _registry.refresh();
    if (!mounted || !_session.isCurrent) return;
    await refresh();
  }

  Future<void> refresh() async {
    if (!mounted || !_session.isCurrent || state.busy) return;
    final pending = _pending;
    state = ContributionFeedbackState(
      summary: state.summary,
      loading: true,
      recoveryChannel: _pendingChannel(pending),
      needsReentry: pending?.needsReentry ?? false,
    );
    try {
      final token = await _session.readToken();
      final summary = await _service.read(target, token);
      if (!mounted || !_session.isCurrent) return;
      state = ContributionFeedbackState(
        summary: summary,
        recoveryChannel: _pendingChannel(pending),
        needsReentry: pending?.needsReentry ?? false,
      );
    } catch (_) {
      if (!mounted || !_session.isCurrent) return;
      state = ContributionFeedbackState(
        recoveryChannel: _pendingChannel(pending),
        needsReentry: pending?.needsReentry ?? false,
        error: 'Feedback state is unavailable. Check the current state.',
      );
    }
  }

  Future<void> change(FeedbackChannel channel, String? value) async {
    if (!mounted ||
        !_session.isCurrent ||
        !_session.isAuthenticated ||
        _actor == null ||
        state.busy ||
        state.loading ||
        state.summary == null) {
      return;
    }
    final pending = _pending;
    if (pending != null &&
        (!pending.needsReentry || _pendingChannel(pending) != channel)) {
      return;
    }
    await _send(channel, value);
  }

  Future<void> retrySaved() async {
    final pending = _pending;
    if (pending == null ||
        pending.needsReentry ||
        state.busy ||
        state.loading) {
      return;
    }
    final body = pending.payload['body'];
    if (body is! Map || !body.containsKey('body')) return;
    await _send(_pendingChannel(pending)!, body['body'] as String?);
  }

  Future<void> _send(FeedbackChannel channel, String? value) async {
    final previous = state.summary;
    state = ContributionFeedbackState(
      summary: previous,
      busy: true,
      recoveryChannel: _pendingChannel(_pending),
      needsReentry: _pending?.needsReentry ?? false,
    );
    ContentMutationAttempt? attempt;
    var confirmed = false;
    try {
      final token = await _session.readToken();
      _session.requireCurrent();
      attempt = await _registry.beginDurable(_scope(channel), {
        'method': 'PUT',
        'body': {'body': value, 'channel': channel.name},
      });
      _session.requireCurrent();
      await _service.change(target, channel, value, token!, attempt.key);
      confirmed = true;
      await _registry.finishDurable(attempt, confirmed: true);
      _session.requireCurrent();
      final summary = await _service.read(target, token);
      if (!mounted || !_session.isCurrent) return;
      state = ContributionFeedbackState(summary: summary);
    } catch (error) {
      final status = error is DioException ? error.response?.statusCode : null;
      final denied =
          status != null && status >= 400 && status < 500 && status != 409;
      if (attempt != null && !confirmed) {
        try {
          await _registry.finishDurable(attempt, uncertain: !denied);
        } catch (_) {}
      }
      if (!mounted || !_session.isCurrent) return;
      final pending = _pending;
      state = ContributionFeedbackState(
        summary: confirmed ? null : previous,
        recoveryChannel: _pendingChannel(pending),
        needsReentry: pending?.needsReentry ?? false,
        error: pending != null
            ? 'The previous change is unconfirmed. Retry the same change to check it.'
            : confirmed
            ? 'Feedback was saved, but its current state is unavailable.'
            : error is ContentMutationFailure
            ? error.message
            : 'This feedback was not accepted.',
      );
    }
  }
}
