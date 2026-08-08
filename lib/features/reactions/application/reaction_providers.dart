// ignore_for_file: public_member_api_docs

import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:lythaus/core/network/dio_client.dart';
import 'package:lythaus/features/reactions/domain/reaction.dart';

// ─────────────────────────────────────────────────────────────────────────────
// submitReactionProvider
//
// Family provider that takes a [SubmitReactionRequest] and sends it to
// POST /api/reactions.  Returns [SubmitReactionResponse] on success.
// ─────────────────────────────────────────────────────────────────────────────

final submitReactionProvider =
    FutureProvider.family<SubmitReactionResponse, SubmitReactionRequest>((
      ref,
      request,
    ) async {
      final dio = ref.read(secureDioProvider);
      final response = await dio.post<Map<String, dynamic>>(
        '/reactions',
        data: request.toJson(),
      );
      final data = response.data;
      if (data == null) {
        throw StateError('Empty response from reactions endpoint');
      }
      return SubmitReactionResponse.fromJson(data);
    });

// ─────────────────────────────────────────────────────────────────────────────
// deleteReactionProvider
//
// Family provider that takes a reactionId string and sends DELETE to
// /api/reactions/{id}.
// ─────────────────────────────────────────────────────────────────────────────

final deleteReactionProvider = FutureProvider.family<void, String>((
  ref,
  reactionId,
) async {
  final dio = ref.read(secureDioProvider);
  await dio.delete<void>('/reactions/$reactionId');
});
