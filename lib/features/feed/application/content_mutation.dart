// ignore_for_file: public_member_api_docs

import 'dart:convert';

import 'package:crypto/crypto.dart';
import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lythaus/core/network/idempotency_key.dart';
import 'package:lythaus/features/auth/application/auth_providers.dart';
import 'package:lythaus/features/feed/application/content_recovery_lock.dart';
import 'package:lythaus/features/feed/application/content_recovery_storage.dart';

final contentMutationRegistryProvider =
    ChangeNotifierProvider<ContentMutationRegistry>((ref) {
      final registry = ContentMutationRegistry(
        storage: ref.read(contentRecoveryStorageProvider),
      );
      registry.activate(ref.read(currentUserProvider)?.id);
      ref.listen(currentUserProvider, (previous, next) {
        if (previous?.id != next?.id) registry.activate(next?.id);
      });
      return registry;
    });

class ContentMutationAttempt {
  ContentMutationAttempt(
    this.scope,
    Map<String, dynamic> payload, {
    String? key,
    String? fingerprint,
    DateTime? expiresAt,
  }) : key = key ?? IdempotencyKey.create('content'),
       payload =
           _freeze(jsonDecode(jsonEncode(payload))) as Map<String, dynamic>,
       fingerprint = fingerprint ?? _fingerprint(payload),
       expiresAt = expiresAt ?? DateTime.now().add(const Duration(days: 7));

  final String scope;
  final String key;
  final Map<String, dynamic> payload;
  final String fingerprint;
  final DateTime expiresAt;
  bool inFlight = false;
  bool replaying = false;
  int? _issuedEpoch;
  bool get needsReentry =>
      payload['method'] != 'DELETE' &&
      (payload['body'] is Map
          ? !(payload['body'] as Map).containsKey('body')
          : !payload.containsKey('body'));
}

Object? _freeze(Object? value) => switch (value) {
  final Map<String, dynamic> map => Map<String, dynamic>.unmodifiable(
    map.map((key, item) => MapEntry(key, _freeze(item))),
  ),
  final List<Object?> list => List<Object?>.unmodifiable(list.map(_freeze)),
  _ => value,
};

String _fingerprint(Map<String, dynamic> payload) =>
    sha256.convert(utf8.encode(jsonEncode(payload))).toString();

class OwnedContent {
  const OwnedContent(this.kind, this.id, {this.postId});
  final String kind;
  final String id;
  final String? postId;
  Map<String, dynamic> toJson() => {
    'kind': kind,
    'id': id,
    if (postId != null) 'postId': postId,
  };
}

/// Account-bound write-ahead journal. No tokens, emails or content are logged.
class ContentMutationRegistry extends ChangeNotifier {
  ContentMutationRegistry({
    ContentRecoveryStorage? storage,
    DateTime Function()? clock,
  }) : _storage = storage,
       _clock = clock ?? DateTime.now;
  final ContentRecoveryStorage? _storage;
  final DateTime Function() _clock;
  final _attempts = <String, ContentMutationAttempt>{};
  final _drafts = <String, Map<String, dynamic>>{};
  final _owned = <String, OwnedContent>{};
  Future<void> _tail = Future.value();
  Future<void> ready = Future.value();
  String? _actor;
  int _epoch = 0;
  bool storageUnavailable = false;
  bool _disposed = false;

  int get sessionEpoch => _epoch;
  List<OwnedContent> get owned => List.unmodifiable(_owned.values);
  List<ContentMutationAttempt> get attempts =>
      List.unmodifiable(_attempts.values);
  Map<String, dynamic>? draft(String scope) {
    final entry = _drafts[scope];
    if (entry == null ||
        (entry['expiresAt'] as int) <= _clock().millisecondsSinceEpoch) {
      return null;
    }
    return Map<String, dynamic>.from(entry['data'] as Map);
  }

  String _storageKey(String actor) =>
      'lythaus.content-recovery.v1.${sha256.convert(utf8.encode(actor))}';
  void _changed() {
    if (!_disposed) notifyListeners();
  }

  Future<T> _queue<T>(Future<T> Function() action) {
    final future = _tail.then(
      (_) => withContentRecoveryLock(_storage ?? this, action),
    );
    _tail = future.then<void>((_) {}, onError: (Object _, StackTrace __) {});
    return future;
  }

  void activate(String? actor) {
    if (_actor == actor) return;
    final previous = _actor;
    _actor = actor;
    final epoch = ++_epoch;
    _attempts.clear();
    _drafts.clear();
    _owned.clear();
    storageUnavailable = false;
    ready = _queue(() async {
      try {
        if (previous != null && _storage != null) {
          final old = await _read(previous);
          old['drafts'] = <String, dynamic>{};
          for (final attempt in (old['attempts'] as Map).values) {
            final map = attempt as Map;
            map['payload'] = _routingOnly(
              Map<String, dynamic>.from(map['payload'] as Map),
            );
          }
          await _storage.write(_storageKey(previous), jsonEncode(old));
        }
        if (actor != null && _storage != null) {
          final data = await _read(actor);
          await _storage.write(_storageKey(actor), jsonEncode(data));
          if (_epoch == epoch) _restore(data);
        }
      } catch (_) {
        if (_epoch == epoch) storageUnavailable = true;
      }
      if (_epoch == epoch) _changed();
    });
    // Clear private in-memory state before asynchronous storage work.
    _changed();
  }

  Map<String, dynamic> _routingOnly(Map<String, dynamic> payload) => {
    if (payload['method'] != null) 'method': payload['method'],
    if (payload['declaredCreationMode'] != null)
      'declaredCreationMode': payload['declaredCreationMode'],
    if (payload['parentId'] != null) 'parentId': payload['parentId'],
    if (payload['postId'] != null) 'postId': payload['postId'],
    if (payload['geoScope'] != null) 'geoScope': payload['geoScope'],
    if (payload['body'] is Map)
      'body': {
        if ((payload['body'] as Map)['declaredCreationMode'] != null)
          'declaredCreationMode':
              (payload['body'] as Map)['declaredCreationMode'],
      },
  };

  Future<void> refresh() async {
    await ready;
    final actor = _actor;
    final epoch = _epoch;
    if (actor == null || _storage == null) return;
    await _queue(() async {
      if (_epoch != epoch) return;
      try {
        final data = await _read(actor);
        if (_epoch != epoch) return;
        _restore(data);
        storageUnavailable = false;
      } catch (_) {
        if (_epoch != epoch) return;
        storageUnavailable = true;
      }
      _changed();
    });
  }

  Future<Map<String, dynamic>> _read(String actor) async {
    final raw = await _storage!.read(_storageKey(actor));
    final data = raw == null
        ? <String, dynamic>{
            'version': 1,
            'attempts': <String, dynamic>{},
            'drafts': <String, dynamic>{},
            'owned': <dynamic>[],
          }
        : Map<String, dynamic>.from(jsonDecode(raw) as Map);
    if (data['version'] != 1 ||
        data['attempts'] is! Map ||
        data['drafts'] is! Map ||
        data['owned'] is! List) {
      throw const FormatException('Unsupported recovery journal');
    }
    final now = _clock().millisecondsSinceEpoch;
    (data['drafts'] as Map).removeWhere(
      (_, value) => (value as Map)['expiresAt'] as int <= now,
    );
    for (final value in (data['attempts'] as Map).values) {
      final attempt = value as Map;
      if ((attempt['expiresAt'] as int) <= now) {
        attempt['payload'] = _routingOnly(
          Map<String, dynamic>.from(attempt['payload'] as Map),
        );
      }
    }
    // Persist expiry cleanup even when a later conflicting request is rejected.
    final cleaned = jsonEncode(data);
    if (raw != null && raw != cleaned) {
      await _storage.write(_storageKey(actor), cleaned);
    }
    return data;
  }

  void _restore(Map<String, dynamic> data) {
    final previous = Map<String, ContentMutationAttempt>.from(_attempts);
    _attempts.clear();
    for (final entry in (data['attempts'] as Map).entries) {
      final value = entry.value as Map;
      final existing = previous[entry.key];
      _attempts[entry.key as String] =
          existing?.key == value['key'] &&
              jsonEncode(existing!.payload) == jsonEncode(value['payload'])
          ? existing
          : ContentMutationAttempt(
              entry.key as String,
              Map<String, dynamic>.from(value['payload'] as Map),
              key: value['key'] as String,
              fingerprint: value['fingerprint'] as String,
              expiresAt: DateTime.fromMillisecondsSinceEpoch(
                value['expiresAt'] as int,
              ),
            );
      _attempts[entry.key]!.replaying = existing?.replaying ?? true;
    }
    _drafts
      ..clear()
      ..addAll(
        Map<String, Map<String, dynamic>>.from(
          (data['drafts'] as Map).map(
            (key, value) => MapEntry(
              key as String,
              Map<String, dynamic>.from(value as Map),
            ),
          ),
        ),
      );
    _owned.clear();
    for (final value in data['owned'] as List) {
      final map = value as Map;
      final item = OwnedContent(
        map['kind'] as String,
        map['id'] as String,
        postId: map['postId'] as String?,
      );
      _owned['${item.kind}:${item.id}'] = item;
    }
  }

  bool _matches(String scope, String? actor) => actor == null
      ? scope.split(':').contains('session')
      : scope.split(':').contains(actor);

  Future<bool> saveDraft(String scope, Map<String, dynamic>? draft) async {
    final actor = _actor;
    final epoch = _epoch;
    if (!_matches(scope, actor)) return false;
    if (actor == null || _storage == null) return true;
    try {
      await ready;
      return await _queue(() async {
        if (_epoch != epoch || storageUnavailable) return false;
        final data = await _read(actor);
        final drafts = data['drafts'] as Map;
        if (draft == null) {
          drafts.remove(scope);
        } else {
          drafts[scope] = {
            'data': draft,
            'expiresAt': _clock()
                .add(const Duration(hours: 24))
                .millisecondsSinceEpoch,
          };
        }
        await _storage.write(_storageKey(actor), jsonEncode(data));
        if (_epoch == epoch) {
          _restore(data);
          _changed();
        }
        return true;
      });
    } catch (_) {
      return false;
    }
  }

  ContentMutationAttempt? pending(String scope) => _attempts[scope];

  ContentMutationAttempt begin(String scope, Map<String, dynamic> payload) {
    final pending = _attempts[scope];
    if (pending?.inFlight == true) {
      throw const ContentMutationFailure(
        'This submission is still processing.',
      );
    }
    if (pending != null && pending.fingerprint != _fingerprint(payload)) {
      throw const ContentMutationFailure(
        'Check the previous submission before changing this content.',
        uncertain: false,
      );
    }
    final attempt = pending == null
        ? ContentMutationAttempt(
            scope,
            payload,
            expiresAt: _clock().add(const Duration(days: 7)),
          )
        : pending.needsReentry
        ? ContentMutationAttempt(
            scope,
            payload,
            key: pending.key,
            fingerprint: pending.fingerprint,
            expiresAt: pending.expiresAt,
          )
        : pending;
    attempt.inFlight = true;
    attempt._issuedEpoch = _epoch;
    if (pending != null) attempt.replaying = true;
    _attempts[scope] = attempt;
    return attempt;
  }

  void finish(ContentMutationAttempt attempt, {bool uncertain = false}) {
    attempt.inFlight = false;
    if (!uncertain && identical(_attempts[attempt.scope], attempt)) {
      _attempts.remove(attempt.scope);
    }
  }

  Future<ContentMutationAttempt> beginDurable(
    String scope,
    Map<String, dynamic> payload,
  ) async {
    final actor = _actor;
    final epoch = _epoch;
    await ready;
    if (_epoch != epoch || !_matches(scope, actor)) {
      throw const ContentMutationFailure(
        'Sign in as the original author to continue.',
        uncertain: false,
      );
    }
    if (actor == null || _storage == null) return begin(scope, payload);
    return _queue(() async {
      if (_epoch != epoch || storageUnavailable) {
        throw const ContentMutationFailure(
          'Recovery storage is unavailable. No new request has been sent.',
          uncertain: false,
        );
      }
      try {
        final data = await _read(actor);
        if (_actor != actor || _epoch != epoch) {
          throw const ContentMutationFailure(
            'Your session changed. Sign in again.',
            uncertain: false,
          );
        }
        _restore(data);
        final attempt = begin(scope, payload);
        (data['attempts'] as Map)[scope] = {
          'key': attempt.key,
          'fingerprint': attempt.fingerprint,
          'payload': attempt.payload,
          'expiresAt': attempt.expiresAt.millisecondsSinceEpoch,
        };
        await _storage.write(_storageKey(actor), jsonEncode(data));
        if (_epoch != epoch) {
          throw const ContentMutationFailure(
            'Your session changed. Sign in again.',
            uncertain: false,
          );
        }
        _changed();
        return attempt;
      } on ContentMutationFailure {
        rethrow;
      } catch (_) {
        _attempts[scope]?.inFlight = false;
        throw const ContentMutationFailure(
          'Unable to save recovery data. No new request has been sent.',
          uncertain: false,
        );
      }
    });
  }

  Future<void> finishDurable(
    ContentMutationAttempt attempt, {
    bool uncertain = false,
    OwnedContent? receipt,
    bool deleted = false,
  }) async {
    // A rejection on a retry cannot establish the earlier request's outcome.
    if (attempt.replaying && receipt == null) uncertain = true;
    if (attempt._issuedEpoch != _epoch) return;
    final actor = _actor;
    final epoch = _epoch;
    attempt.inFlight = false;
    if (!_matches(attempt.scope, actor)) return;
    if (actor == null || _storage == null) {
      finish(attempt, uncertain: uncertain);
      if (receipt != null) _owned['${receipt.kind}:${receipt.id}'] = receipt;
      return;
    }
    await _queue(() async {
      if (_epoch != epoch) return;
      try {
        final data = await _read(actor);
        final saved = (data['attempts'] as Map)[attempt.scope];
        if (!uncertain && saved is Map && saved['key'] == attempt.key) {
          (data['attempts'] as Map).remove(attempt.scope);
          if (receipt != null) {
            (data['drafts'] as Map).remove(attempt.scope);
            final items = data['owned'] as List;
            items.removeWhere(
              (item) =>
                  (item as Map)['kind'] == receipt.kind &&
                  item['id'] == receipt.id,
            );
            if (!deleted) items.add(receipt.toJson());
          }
        }
        await _storage.write(_storageKey(actor), jsonEncode(data));
        if (_epoch == epoch) {
          _restore(data);
          _changed();
        }
      } catch (_) {
        throw const ContentMutationFailure(
          'The response could not be saved. Retry to check the same request.',
        );
      }
    });
  }

  @override
  void dispose() {
    _disposed = true;
    super.dispose();
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
    'post_tag_limit_exceeded' =>
      'This post has too many distinct tags for search. Remove some tags and try again.',
    'post_not_found' ||
    'post_not_available' ||
    'comment_not_found' => 'This content is unavailable.',
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
