// ignore_for_file: public_member_api_docs

import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:lythaus/core/network/dio_client.dart';
import 'package:lythaus/core/network/idempotency_key.dart';
import 'package:lythaus/features/reactions/domain/reaction.dart';

// ─────────────────────────────────────────────────────────────────────────────
// submitReactionProvider
//
// Family provider that takes a [SubmitReactionRequest] and sends it to
// POST /posts/{postId}/reactions. Returns [SubmitReactionResponse] on success.
// ─────────────────────────────────────────────────────────────────────────────

final submitReactionProvider =
    FutureProvider.family<SubmitReactionResponse, SubmitReactionRequest>((
      ref,
      request,
    ) async {
      final dio = ref.read(secureDioProvider);
      final response = await dio.post<Map<String, dynamic>>(
        '/posts/${request.postId}/reactions',
        data: request.toJson(),
        options: Options(
          headers: {
            'Idempotency-Key': IdempotencyKey.create('reaction-create'),
          },
        ),
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
// Family provider that takes a post ID and sends DELETE to
// /posts/{postId}/reactions.
// ─────────────────────────────────────────────────────────────────────────────

final deleteReactionProvider = FutureProvider.family<void, String>((
  ref,
  postId,
) async {
  final dio = ref.read(secureDioProvider);
  await dio.delete<void>(
    '/posts/$postId/reactions',
    options: Options(
      headers: {'Idempotency-Key': IdempotencyKey.create('reaction-delete')},
    ),
  );
});
