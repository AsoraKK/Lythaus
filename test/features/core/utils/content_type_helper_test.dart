import 'package:flutter_test/flutter_test.dart';
import 'package:flutter/material.dart';
import 'package:lythaus/features/core/utils/content_type_helper.dart';

void main() {
  group('ContentTypeHelper', () {
    group('getIcon Tests', () {
      test('should return correct icons for known content types', () {
        expect(ContentTypeHelper.getIcon('post'), equals(Icons.article));
        expect(ContentTypeHelper.getIcon('comment'), equals(Icons.comment));
        expect(ContentTypeHelper.getIcon('image'), equals(Icons.image));
        expect(ContentTypeHelper.getIcon('video'), equals(Icons.videocam));
        expect(ContentTypeHelper.getIcon('audio'), equals(Icons.audiotrack));
        expect(ContentTypeHelper.getIcon('link'), equals(Icons.link));
        expect(ContentTypeHelper.getIcon('poll'), equals(Icons.poll));
        expect(ContentTypeHelper.getIcon('event'), equals(Icons.event));
        expect(ContentTypeHelper.getIcon('group'), equals(Icons.group));
        expect(ContentTypeHelper.getIcon('message'), equals(Icons.message));
      });

      test('should return help_outline icon for unknown content types', () {
        expect(
          ContentTypeHelper.getIcon('unknown'),
          equals(Icons.help_outline),
        );
        expect(ContentTypeHelper.getIcon(''), equals(Icons.help_outline));
        expect(ContentTypeHelper.getIcon('xyz'), equals(Icons.help_outline));
      });

      test('should handle case insensitive content types', () {
        expect(ContentTypeHelper.getIcon('POST'), equals(Icons.article));
        expect(ContentTypeHelper.getIcon('Comment'), equals(Icons.comment));
        expect(ContentTypeHelper.getIcon('IMAGE'), equals(Icons.image));
        expect(ContentTypeHelper.getIcon('Video'), equals(Icons.videocam));
      });
    });

    group('getLabel Tests', () {
      test('should return correct labels for known content types', () {
        expect(ContentTypeHelper.getLabel('post'), equals('Post'));
        expect(ContentTypeHelper.getLabel('comment'), equals('Comment'));
        expect(ContentTypeHelper.getLabel('image'), equals('Image'));
        expect(ContentTypeHelper.getLabel('video'), equals('Video'));
        expect(ContentTypeHelper.getLabel('audio'), equals('Audio'));
        expect(ContentTypeHelper.getLabel('link'), equals('Link'));
        expect(ContentTypeHelper.getLabel('poll'), equals('Poll'));
        expect(ContentTypeHelper.getLabel('event'), equals('Event'));
        expect(ContentTypeHelper.getLabel('group'), equals('Group'));
        expect(ContentTypeHelper.getLabel('message'), equals('Message'));
      });

      test('should return "Content" label for unknown content types', () {
        expect(ContentTypeHelper.getLabel('unknown'), equals('Content'));
        expect(ContentTypeHelper.getLabel(''), equals('Content'));
        expect(ContentTypeHelper.getLabel('xyz'), equals('Content'));
      });

      test('should handle case insensitive content types', () {
        expect(ContentTypeHelper.getLabel('POST'), equals('Post'));
        expect(ContentTypeHelper.getLabel('Comment'), equals('Comment'));
        expect(ContentTypeHelper.getLabel('IMAGE'), equals('Image'));
        expect(ContentTypeHelper.getLabel('Video'), equals('Video'));
      });
    });

    group('getColor Tests', () {
      test('should return correct colors for known content types', () {
        expect(ContentTypeHelper.getColor('post'), equals(Colors.blue));
        expect(ContentTypeHelper.getColor('comment'), equals(Colors.green));
        expect(ContentTypeHelper.getColor('image'), equals(Colors.purple));
        expect(ContentTypeHelper.getColor('video'), equals(Colors.red));
        expect(ContentTypeHelper.getColor('audio'), equals(Colors.orange));
        expect(ContentTypeHelper.getColor('link'), equals(Colors.teal));
        expect(ContentTypeHelper.getColor('poll'), equals(Colors.indigo));
        expect(ContentTypeHelper.getColor('event'), equals(Colors.amber));
        expect(ContentTypeHelper.getColor('group'), equals(Colors.cyan));
        expect(ContentTypeHelper.getColor('message'), equals(Colors.pink));
      });

      test('should return grey color for unknown content types', () {
        expect(ContentTypeHelper.getColor('unknown'), equals(Colors.grey));
        expect(ContentTypeHelper.getColor(''), equals(Colors.grey));
        expect(ContentTypeHelper.getColor('xyz'), equals(Colors.grey));
      });

      test('should handle case insensitive content types', () {
        expect(ContentTypeHelper.getColor('POST'), equals(Colors.blue));
        expect(ContentTypeHelper.getColor('Comment'), equals(Colors.green));
        expect(ContentTypeHelper.getColor('IMAGE'), equals(Colors.purple));
        expect(ContentTypeHelper.getColor('Video'), equals(Colors.red));
      });
    });

    group('supportsPreview Tests', () {
      test('should return true for content types that support preview', () {
        expect(ContentTypeHelper.supportsPreview('post'), isTrue);
        expect(ContentTypeHelper.supportsPreview('comment'), isTrue);
        expect(ContentTypeHelper.supportsPreview('message'), isTrue);
      });

      test(
        'should return false for content types that do not support preview',
        () {
          expect(ContentTypeHelper.supportsPreview('image'), isFalse);
          expect(ContentTypeHelper.supportsPreview('video'), isFalse);
          expect(ContentTypeHelper.supportsPreview('audio'), isFalse);
          expect(ContentTypeHelper.supportsPreview('link'), isFalse);
          expect(ContentTypeHelper.supportsPreview('poll'), isFalse);
          expect(ContentTypeHelper.supportsPreview('event'), isFalse);
          expect(ContentTypeHelper.supportsPreview('group'), isFalse);
        },
      );

      test('should return false for unknown content types', () {
        expect(ContentTypeHelper.supportsPreview('unknown'), isFalse);
        expect(ContentTypeHelper.supportsPreview(''), isFalse);
        expect(ContentTypeHelper.supportsPreview('xyz'), isFalse);
      });

      test('should handle case insensitive content types', () {
        expect(ContentTypeHelper.supportsPreview('POST'), isTrue);
        expect(ContentTypeHelper.supportsPreview('Comment'), isTrue);
        expect(ContentTypeHelper.supportsPreview('MESSAGE'), isTrue);
        expect(ContentTypeHelper.supportsPreview('Image'), isFalse);
      });
    });

    group('getAllTypes Tests', () {
      test('should return all supported content types', () {
        final allTypes = ContentTypeHelper.getAllTypes();

        expect(allTypes, isA<List<String>>());
        expect(allTypes.length, equals(10));

        // Check all expected types are present
        expect(allTypes, contains('post'));
        expect(allTypes, contains('comment'));
        expect(allTypes, contains('image'));
        expect(allTypes, contains('video'));
        expect(allTypes, contains('audio'));
        expect(allTypes, contains('link'));
        expect(allTypes, contains('poll'));
        expect(allTypes, contains('event'));
        expect(allTypes, contains('group'));
        expect(allTypes, contains('message'));
      });

      test('should return types in consistent order', () {
        final allTypes1 = ContentTypeHelper.getAllTypes();
        final allTypes2 = ContentTypeHelper.getAllTypes();

        expect(allTypes1, equals(allTypes2));
      });

      test('should return list with expected first and last elements', () {
        final allTypes = ContentTypeHelper.getAllTypes();

        expect(allTypes.first, equals('post'));
        expect(allTypes.last, equals('message'));
      });
    });

    group('Integration Tests', () {
      test('should have consistent mappings across all methods', () {
        final allTypes = ContentTypeHelper.getAllTypes();

        for (final type in allTypes) {
          // Each type should have an icon (not default)
          final icon = ContentTypeHelper.getIcon(type);
          expect(icon, isNotNull);

          // Each type should have a proper label (not default "Content")
          final label = ContentTypeHelper.getLabel(type);
          expect(label, isNotNull);
          expect(label, isNot(equals('Content')));

          // Each type should have a color (not default grey)
          final color = ContentTypeHelper.getColor(type);
          expect(color, isNotNull);
          expect(color, isNot(equals(Colors.grey)));

          // supportsPreview should return a boolean
          final supportsPreview = ContentTypeHelper.supportsPreview(type);
          expect(supportsPreview, isA<bool>());
        }
      });

      test('should handle edge cases consistently', () {
        final edgeCases = [
          '',
          'unknown',
          'UNKNOWN',
          'null',
          '123',
          'special@chars',
        ];

        for (final edgeCase in edgeCases) {
          expect(
            ContentTypeHelper.getIcon(edgeCase),
            equals(Icons.help_outline),
          );
          expect(ContentTypeHelper.getLabel(edgeCase), equals('Content'));
          expect(ContentTypeHelper.getColor(edgeCase), equals(Colors.grey));
          expect(ContentTypeHelper.supportsPreview(edgeCase), isFalse);
        }
      });

      test('should maintain type safety with return types', () {
        expect(ContentTypeHelper.getIcon('post'), isA<IconData>());
        expect(ContentTypeHelper.getLabel('post'), isA<String>());
        expect(ContentTypeHelper.getColor('post'), isA<Color>());
        expect(ContentTypeHelper.supportsPreview('post'), isA<bool>());
        expect(ContentTypeHelper.getAllTypes(), isA<List<String>>());
      });
    });
  });
}
