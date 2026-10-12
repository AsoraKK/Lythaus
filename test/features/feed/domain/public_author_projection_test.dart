import 'package:flutter_test/flutter_test.dart';
import 'package:lythaus/features/feed/domain/models.dart';

void main() {
  const id = '01a044e4-3860-7f76-b819-5be99e0000f6';
  Post post(Map<String, dynamic> fields) => Post.fromJson({
    'id': 'post',
    'authorId': id,
    'body': 'A member update',
    ...fields,
  });
  test('public projection prefers permitted display name and then handle', () {
    expect(
      post({'authorDisplayName': 'Kai', 'authorHandle': 'kai'}).authorUsername,
      'Kai',
    );
    expect(
      post({'authorDisplayName': '', 'authorHandle': 'kai'}).authorUsername,
      '@kai',
    );
  });
  test('absent, blank and identifier labels use a humane fallback', () {
    for (final value in [null, '', '  ', id]) {
      final item = post({'authorDisplayName': value, 'authorHandle': null});
      expect(item.authorUsername, 'Lythaus member');
      expect(item.authorId, id);
    }
    expect(post({'authorUsername': id}).authorUsername, 'Lythaus member');
  });
  test('public cards never use owner name or contact fields', () {
    expect(
      post({
        'email': 'private@example.invalid',
        'accountabilityName': 'Private name',
        'author': {'id': id, 'email': 'private@example.invalid'},
      }).authorUsername,
      'Lythaus member',
    );
  });
}
