import 'package:flutter_test/flutter_test.dart';
import 'package:lythaus/features/feed/domain/models.dart';

/// Coverage tests for Post.fromJson edge-case branches in models.dart.
/// Targets uncovered lines:
///   92 — NewsSource.fromJson(sourceJson) when source is Map<String, dynamic>
///  108 — Map<String, dynamic>.from(timeline) when timeline is Map but not
///         Map<String, dynamic>
///  162 — PostMetadata fallback from top-level location/topics/category
void main() {
  test('Post.fromJson with source as Map<String, dynamic>', () {
    final json = <String, dynamic>{
      'id': 'p1',
      'authorId': 'a1',
      'authorUsername': 'alice',
      'text': 'Hello world',
      'createdAt': '2024-06-01T12:00:00.000Z',
      'source': <String, dynamic>{'type': 'curated', 'name': 'Reuters'},
    };
    final post = Post.fromJson(json);
    expect(post.source, isNotNull);
    expect(post.source!.name, 'Reuters');
  });

  test('Post.fromJson with timeline as untyped Map', () {
    // Build a Map that is `Map` but NOT `Map<String, dynamic>` at runtime
    // to trigger the second branch in the ternary.
    // Cast via Object to ensure runtime type is _LinkedHashMap<Object, Object>.
    final Map<dynamic, dynamic> untypedTimeline = Map<Object, Object>.from({
      'created': 'complete',
      'moderation': 'flagged',
    });
    final json = <String, dynamic>{
      'id': 'p2',
      'authorId': 'a2',
      'authorUsername': 'bob',
      'text': 'Test',
      'createdAt': '2024-06-01T12:00:00.000Z',
      'timeline': untypedTimeline,
    };
    final post = Post.fromJson(json);
    expect(post.timeline.moderation, 'none');
  });

  test('Post.fromJson with fallback metadata from top-level keys', () {
    final json = <String, dynamic>{
      'id': 'p3',
      'authorId': 'a3',
      'authorUsername': 'carol',
      'text': 'News article',
      'createdAt': '2024-06-01T12:00:00.000Z',
      // no 'metadata' key — force the fallback path using top-level keys
      'location': 'London',
      'topics': <String>['politics', 'economy'],
      'category': 'news',
    };
    final post = Post.fromJson(json);
    expect(post.metadata, isNotNull);
    expect(post.metadata!.location, 'London');
    expect(post.metadata!.tags, containsAll(['politics', 'economy']));
    expect(post.metadata!.category, 'news');
  });
}
