// ignore_for_file: public_member_api_docs

import 'dart:convert';

import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lythaus/core/network/idempotency_key.dart';

final contentMutationRegistryProvider = Provider<ContentMutationRegistry>(
  (ref) => ContentMutationRegistry(),
);

class ContentMutationAttempt {
  ContentMutationAttempt(this.scope, this.payload)
    : key = IdempotencyKey.create('content');

  final String scope;
  final String key;
  final Map<String, dynamic> payload;
  bool inFlight = false;
}

class ContentMutationRegistry {
  final _attempts = <String, ContentMutationAttempt>{};

  ContentMutationAttempt? pending(String scope) => _attempts[scope];

  ContentMutationAttempt begin(String scope, Map<String, dynamic> payload) {
    final pending = _attempts[scope];
    if (pending?.inFlight == true) {
      throw const ContentMutationFailure(
        'This submission is still processing.',
      );
    }
    if (pending != null && jsonEncode(pending.payload) != jsonEncode(payload)) {
      throw const ContentMutationFailure(
        'Check the previous submission before changing this content.',
      );
    }
    final attempt = pending ?? ContentMutationAttempt(scope, payload);
    attempt.inFlight = true;
    _attempts[scope] = attempt;
    return attempt;
  }

  void finish(ContentMutationAttempt attempt, {bool uncertain = false}) {
    attempt.inFlight = false;
    if (!uncertain && identical(_attempts[attempt.scope], attempt)) {
      _attempts.remove(attempt.scope);
    }
  }
}

class ContentMutationFailure implements Exception {
  const ContentMutationFailure(
    this.message, {
    this.code,
    this.uncertain = true,
  });

  final String message;
  final String? code;
  final bool uncertain;

  @override
  String toString() => message;
}

String? contentErrorCode(Object? data) {
  if (data is! Map) return null;
  final error = data['error'];
  final code = data['code'] ?? (error is Map ? error['code'] : error);
  return code is String ? code : null;
}

ContentMutationFailure contentMutationFailure(Object error) {
  if (error is ContentMutationFailure) return error;
  if (error is! DioException) {
    return const ContentMutationFailure(
      'The submission outcome is unknown. Retry to check the same submission.',
    );
  }
  final code = contentErrorCode(error.response?.data);
  final status = error.response?.statusCode;
  final uncertain =
      status == null ||
      status >= 500 ||
      (code?.startsWith('idempotency_') ?? false);
  final message = switch (code) {
    'idempotency_in_progress' =>
      'This submission is still processing. Retry to check the same submission.',
    'idempotency_outcome_unknown' || 'idempotency_key_conflict' =>
      'The submission outcome is unknown. Retry to check the same submission.',
    'daily_comment_limit_exceeded' ||
    'daily_comment_limit_reached' ||
    'DAILY_COMMENT_LIMIT_EXCEEDED' =>
      'You have reached your daily comment limit. Please try again tomorrow.',
    'ai_generated_public_content_blocked' ||
    'content_blocked' ||
    'CONTENT_BLOCKED' =>
      'This content conflicts with policy and was not submitted.',
    'ai_assisted_public_text_too_long' ||
    'ai_assisted_character_limit_exceeded' =>
      'AI-assisted public text cannot exceed 249 user-perceived characters.',
    'declared_creation_mode_required' || 'invalid_declared_creation_mode' =>
      'Choose an authorship disclosure before submitting.',
    'invalid_comment_parent' => 'This reply target is unavailable.',
    'post_not_found' || 'comment_not_found' => 'This content is unavailable.',
    'device_integrity_blocked' || 'DEVICE_INTEGRITY_BLOCKED' =>
      'This device cannot submit content. Check your device security settings.',
    _ when status == 401 => 'Sign in to submit content.',
    _ when status == 403 => 'You are not allowed to change this content.',
    _ when status == 429 =>
      'Too many requests. Please wait before trying again.',
    _ when uncertain =>
      'The submission outcome is unknown. Retry to check the same submission.',
    _ => 'Unable to submit this change. Please try again.',
  };
  return ContentMutationFailure(message, code: code, uncertain: uncertain);
}

Map<String, dynamic> contentResponsePayload(Map<String, dynamic>? data) {
  if (data == null) {
    throw const ContentMutationFailure(
      'The submission response was incomplete.',
    );
  }
  final nested = data['data'] ?? data['post'] ?? data['comment'];
  return nested is Map<String, dynamic> ? nested : data;
}
