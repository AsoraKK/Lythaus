// ignore_for_file: public_member_api_docs

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lythaus/features/feed/application/content_recovery_storage.dart';

final commentSortPreferenceProvider = StateProvider.family<String, String>(
  (ref, actorId) => 'newest',
);

final commentSortStoreProvider = Provider<CommentSortStore>(
  (ref) => CommentSortStore(ref.read(contentRecoveryStorageProvider)),
);

class CommentSortStore {
  CommentSortStore(this._storage);
  final ContentRecoveryStorage _storage;

  Future<String?> read(String actorId) async {
    final value = await _storage.read('lythaus.comments.sort.$actorId');
    return value == 'newest' || value == 'oldest' ? value : null;
  }

  Future<void> write(String actorId, String sort) async {
    if (sort != 'newest' && sort != 'oldest') throw ArgumentError.value(sort);
    await _storage.write('lythaus.comments.sort.$actorId', sort);
  }
}
