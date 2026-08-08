// ignore_for_file: public_member_api_docs

import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:lythaus/features/auth/application/auth_providers.dart';
import 'package:lythaus/features/moderation/domain/moderation_audit_entry.dart';
import 'package:lythaus/features/moderation/domain/moderation_case.dart';
import 'package:lythaus/features/moderation/domain/moderation_decision.dart';
import 'package:lythaus/features/moderation/domain/moderation_filters.dart';
import 'package:lythaus/features/moderation/domain/moderation_queue_item.dart';
import 'package:lythaus/features/moderation/telemetry/moderation_telemetry.dart';
import 'package:lythaus/features/moderation/domain/moderation_repository.dart';
import 'package:lythaus/core/providers/repository_providers.dart';

Future<String> _requireJwtToken(Ref ref) async {
  final token = await ref.watch(jwtProvider.future);
  if (token == null || token.isEmpty) {
    throw const ModerationException('User not authenticated');
  }
  return token;
}

class ModerationQueueState {
  const ModerationQueueState({
    this.items = const [],
    this.page = 1,
    this.pageSize = 20,
    this.hasMore = true,
    this.errorMessage,
    this.isLoading = false,
    this.isLoadingMore = false,
    this.isRefreshing = false,
    this.filters = const ModerationFilters(),
  });

  final List<ModerationQueueItem> items;
  final int page;
  final int pageSize;
  final bool hasMore;
  final String? errorMessage;
  final bool isLoading;
  final bool isLoadingMore;
  final bool isRefreshing;
  final ModerationFilters filters;

  ModerationQueueState copyWith({
    List<ModerationQueueItem>? items,
    int? page,
    int? pageSize,
    bool? hasMore,
    String? errorMessage,
    bool? isLoading,
    bool? isLoadingMore,
    bool? isRefreshing,
    ModerationFilters? filters,
  }) {
    return ModerationQueueState(
      items: items ?? this.items,
      page: page ?? this.page,
      pageSize: pageSize ?? this.pageSize,
      hasMore: hasMore ?? this.hasMore,
      errorMessage: errorMessage,
      isLoading: isLoading ?? this.isLoading,
      isLoadingMore: isLoadingMore ?? this.isLoadingMore,
      isRefreshing: isRefreshing ?? this.isRefreshing,
      filters: filters ?? this.filters,
    );
  }
}

class ModerationQueueNotifier extends StateNotifier<ModerationQueueState> {
  ModerationQueueNotifier(this._ref)
    : _repository = _ref.read(moderationRepositoryProvider),
      super(const ModerationQueueState()) {
    Future.microtask(refresh);
  }

  final Ref _ref;
  final ModerationRepository _repository;

  Future<void> refresh() => _loadPage(1, clear: true);

  Future<void> loadMore() async {
    if (state.isLoading || state.isLoadingMore || !state.hasMore) {
      return;
    }
    await _loadPage(state.page + 1);
  }

  Future<void> updateFilters(ModerationFilters filters) async {
    state = state.copyWith(filters: filters);
    await _loadPage(1, clear: true);
  }

  Future<void> _loadPage(int page, {bool clear = false}) async {
    if (!clear && !state.hasMore) return;
    if (clear && state.isLoading) return;
    state = state.copyWith(
      isLoading: clear,
      isLoadingMore: !clear,
      isRefreshing: clear,
      errorMessage: null,
      items: clear ? const [] : state.items,
    );

    try {
      final token = await _requireJwtToken(_ref);
      final response = await _repository.fetchModerationQueue(
        page: page,
        pageSize: state.pageSize,
        filters: state.filters,
        token: token,
      );

      final mergedItems = clear
          ? response.items
          : [...state.items, ...response.items];

      state = state.copyWith(
        items: mergedItems,
        page: response.pagination.page,
        hasMore: response.pagination.hasMore,
        isLoading: false,
        isLoadingMore: false,
        isRefreshing: false,
      );
      if (page == 1) {
        ModerationTelemetry.queueViewed(state.filters);
      }
    } on ModerationException catch (error) {
      state = state.copyWith(
        isLoading: false,
        isLoadingMore: false,
        isRefreshing: false,
        errorMessage: error.message,
      );
    } catch (_) {
      state = state.copyWith(
        isLoading: false,
        isLoadingMore: false,
        isRefreshing: false,
        errorMessage: 'Unable to load moderation queue.',
      );
    }
  }
}

final moderationQueueProvider =
    StateNotifierProvider<ModerationQueueNotifier, ModerationQueueState>(
      (ref) => ModerationQueueNotifier(ref),
    );

class ModerationCaseState {
  const ModerationCaseState({
    this.caseDetail,
    this.isLoading = false,
    this.errorMessage,
    this.decisionSubmitting = false,
    this.escalating = false,
  });

  final ModerationCase? caseDetail;
  final bool isLoading;
  final String? errorMessage;
  final bool decisionSubmitting;
  final bool escalating;

  ModerationCaseState copyWith({
    ModerationCase? caseDetail,
    bool? isLoading,
    String? errorMessage,
    bool? decisionSubmitting,
    bool? escalating,
  }) {
    return ModerationCaseState(
      caseDetail: caseDetail ?? this.caseDetail,
      isLoading: isLoading ?? this.isLoading,
      errorMessage: errorMessage,
      decisionSubmitting: decisionSubmitting ?? this.decisionSubmitting,
      escalating: escalating ?? this.escalating,
    );
  }
}

class ModerationCaseNotifier extends StateNotifier<ModerationCaseState> {
  ModerationCaseNotifier(this._ref, this._caseId)
    : _repository = _ref.read(moderationRepositoryProvider),
      super(const ModerationCaseState()) {
    Future.microtask(loadCase);
  }

  final Ref _ref;
  final ModerationRepository _repository;
  final String _caseId;

  Future<void> loadCase() async {
    state = state.copyWith(isLoading: true, errorMessage: null);
    try {
      final token = await _requireJwtToken(_ref);
      final moderationCase = await _repository.fetchModerationCase(
        caseId: _caseId,
        token: token,
      );
      ModerationTelemetry.caseOpened(
        _caseId,
        queue: moderationCase.queue,
        severity: moderationCase.severity.name,
      );
      state = state.copyWith(caseDetail: moderationCase, isLoading: false);
    } on ModerationException catch (error) {
      state = state.copyWith(isLoading: false, errorMessage: error.message);
    } catch (_) {
      state = state.copyWith(
        isLoading: false,
        errorMessage: 'Unable to load case details.',
      );
    }
  }

  Future<void> submitDecision(ModerationDecisionInput input) async {
    if (state.decisionSubmitting) return;
    state = state.copyWith(decisionSubmitting: true, errorMessage: null);
    try {
      final token = await _requireJwtToken(_ref);
      await _repository.submitModerationDecision(
        caseId: _caseId,
        token: token,
        input: input,
      );
      ModerationTelemetry.decisionSubmitted(_caseId, input.action);
      await loadCase();
      state = state.copyWith(decisionSubmitting: false);
    } on ModerationException catch (error) {
      state = state.copyWith(
        decisionSubmitting: false,
        errorMessage: error.message,
      );
    } catch (_) {
      state = state.copyWith(
        decisionSubmitting: false,
        errorMessage: 'Unable to submit decision.',
      );
    }
  }

  Future<void> escalate(ModerationEscalationInput input) async {
    if (state.escalating) return;
    state = state.copyWith(escalating: true, errorMessage: null);
    try {
      final token = await _requireJwtToken(_ref);
      await _repository.escalateModerationCase(
        caseId: _caseId,
        token: token,
        input: input,
      );
      ModerationTelemetry.caseEscalated(_caseId, input.targetQueue);
      await loadCase();
      state = state.copyWith(escalating: false);
    } on ModerationException catch (error) {
      state = state.copyWith(escalating: false, errorMessage: error.message);
    } catch (_) {
      state = state.copyWith(
        escalating: false,
        errorMessage: 'Unable to escalate case.',
      );
    }
  }
}

final moderationCaseProvider =
    StateNotifierProvider.family<
      ModerationCaseNotifier,
      ModerationCaseState,
      String
    >((ref, caseId) => ModerationCaseNotifier(ref, caseId));

class ModerationAuditState {
  const ModerationAuditState({
    this.entries = const [],
    this.page = 1,
    this.pageSize = 20,
    this.hasMore = true,
    this.isLoading = false,
    this.isLoadingMore = false,
    this.errorMessage,
    this.filters = const ModerationAuditSearchFilters(),
  });

  final List<ModerationAuditEntry> entries;
  final int page;
  final int pageSize;
  final bool hasMore;
  final bool isLoading;
  final bool isLoadingMore;
  final String? errorMessage;
  final ModerationAuditSearchFilters filters;

  ModerationAuditState copyWith({
    List<ModerationAuditEntry>? entries,
    int? page,
    int? pageSize,
    bool? hasMore,
    bool? isLoading,
    bool? isLoadingMore,
    String? errorMessage,
    ModerationAuditSearchFilters? filters,
  }) {
    return ModerationAuditState(
      entries: entries ?? this.entries,
      page: page ?? this.page,
      pageSize: pageSize ?? this.pageSize,
      hasMore: hasMore ?? this.hasMore,
      isLoading: isLoading ?? this.isLoading,
      isLoadingMore: isLoadingMore ?? this.isLoadingMore,
      errorMessage: errorMessage,
      filters: filters ?? this.filters,
    );
  }
}

class ModerationAuditNotifier extends StateNotifier<ModerationAuditState> {
  ModerationAuditNotifier(this._ref)
    : _repository = _ref.read(moderationRepositoryProvider),
      super(const ModerationAuditState()) {
    Future.microtask(() => search(state.filters));
  }

  final Ref _ref;
  final ModerationRepository _repository;

  Future<void> search(ModerationAuditSearchFilters filters) async {
    final updated = filters.copyWith(page: 1);
    state = state.copyWith(
      filters: updated,
      entries: const [],
      page: 1,
      hasMore: true,
      isLoading: true,
      isLoadingMore: false,
      errorMessage: null,
    );
    await _fetch(updated, append: false);
  }

  Future<void> loadMore() async {
    if (state.isLoading || state.isLoadingMore || !state.hasMore) {
      return;
    }
    final nextFilters = state.filters.copyWith(page: state.page + 1);
    state = state.copyWith(filters: nextFilters, isLoadingMore: true);
    await _fetch(nextFilters, append: true);
  }

  Future<void> _fetch(
    ModerationAuditSearchFilters filters, {
    required bool append,
  }) async {
    try {
      final token = await _requireJwtToken(_ref);
      final response = await _repository.searchAudit(
        filters: filters,
        token: token,
      );
      if (!append) {
        ModerationTelemetry.auditSearch(filters);
      }
      final mergedEntries = append
          ? [...state.entries, ...response.entries]
          : response.entries;
      state = state.copyWith(
        entries: mergedEntries,
        page: response.pagination.page,
        hasMore: response.pagination.hasMore,
        isLoading: false,
        isLoadingMore: false,
      );
    } on ModerationException catch (error) {
      state = state.copyWith(
        errorMessage: error.message,
        isLoading: false,
        isLoadingMore: false,
      );
    } catch (_) {
      state = state.copyWith(
        errorMessage: 'Unable to load audit results.',
        isLoading: false,
        isLoadingMore: false,
      );
    }
  }
}

final moderationAuditProvider =
    StateNotifierProvider<ModerationAuditNotifier, ModerationAuditState>(
      (ref) => ModerationAuditNotifier(ref),
    );
