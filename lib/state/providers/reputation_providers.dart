// ignore_for_file: public_member_api_docs

import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:lythaus/core/network/dio_client.dart';
import 'package:lythaus/features/auth/application/auth_providers.dart';
import 'package:lythaus/state/models/reputation.dart';

/// The backend-issued reputation snapshot for the signed-in account.
final reputationProvider = FutureProvider<ReputationState>((ref) async {
  final token = await ref.watch(jwtProvider.future);
  if (token == null || token.isEmpty) {
    throw StateError('Sign in to view reputation.');
  }

  final response = await ref
      .read(secureDioProvider)
      .get<Map<String, dynamic>>(
        '/api/reputation/me',
        options: Options(headers: {'Authorization': 'Bearer $token'}),
      );
  final data = response.data;
  if (data == null) {
    throw StateError('The reputation service returned no data.');
  }
  return ReputationState.fromJson(_unwrapEnvelope(data));
});

/// One server-paginated page of reputation ledger entries.
final reputationLedgerPageProvider =
    FutureProvider.family<CursorPage<LedgerEntry>, String?>((ref, cursor) {
      return _fetchCursorPage(
        ref: ref,
        path: '/api/reputation/me/ledger',
        cursor: cursor,
        mapper: LedgerEntry.fromJson,
      );
    });

/// The first ledger page for concise consumers that do not paginate yet.
final reputationLedgerProvider = FutureProvider<List<LedgerEntry>>((ref) async {
  return (await ref.watch(reputationLedgerPageProvider(null).future)).items;
});

/// One server-paginated page of private account activity.
final activityPageProvider =
    FutureProvider.family<CursorPage<ActivityEntry>, ActivityPageQuery?>((
      ref,
      query,
    ) {
      final resolvedQuery = query ?? const ActivityPageQuery();
      final category = resolvedQuery.category.queryValue;
      return _fetchCursorPage(
        ref: ref,
        path: '/api/activity',
        cursor: resolvedQuery.cursor,
        mapper: ActivityEntry.fromJson,
        queryParameters: <String, dynamic>{
          if (category != null) 'category': category,
        },
      );
    });

Future<CursorPage<T>> _fetchCursorPage<T>({
  required Ref ref,
  required String path,
  required String? cursor,
  required T Function(Map<String, dynamic> json) mapper,
  Map<String, dynamic> queryParameters = const <String, dynamic>{},
}) async {
  final token = await ref.watch(jwtProvider.future);
  if (token == null || token.isEmpty) {
    throw StateError('Sign in to view account activity.');
  }

  final response = await ref
      .read(secureDioProvider)
      .get<Map<String, dynamic>>(
        path,
        queryParameters: <String, dynamic>{
          'limit': 20,
          ...queryParameters,
          if (cursor != null && cursor.isNotEmpty) 'cursor': cursor,
        },
        options: Options(headers: {'Authorization': 'Bearer $token'}),
      );
  final data = response.data;
  if (data == null) {
    throw StateError('The account activity service returned no data.');
  }

  final payload = _unwrapEnvelope(data);
  final rawItems = payload['items'] ?? payload['entries'];
  final items = <T>[];
  if (rawItems is List) {
    for (final item in rawItems) {
      if (item is Map) {
        items.add(mapper(Map<String, dynamic>.from(item)));
      }
    }
  }

  return CursorPage<T>(items: items, nextCursor: _nextCursor(payload));
}

Map<String, dynamic> _unwrapEnvelope(Map<String, dynamic> value) {
  final wrapped = value['data'];
  return wrapped is Map ? Map<String, dynamic>.from(wrapped) : value;
}

String? _nextCursor(Map<String, dynamic> payload) {
  final direct =
      payload['nextCursor'] ??
      payload['continuationToken'] ??
      payload['cursor'];
  if (direct is String && direct.isNotEmpty) {
    return direct;
  }
  final pageInfo = payload['pageInfo'];
  if (pageInfo is Map) {
    final cursor = pageInfo['nextCursor'] ?? pageInfo['endCursor'];
    if (cursor is String && cursor.isNotEmpty) {
      return cursor;
    }
  }
  return null;
}
