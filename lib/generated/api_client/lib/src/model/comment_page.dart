//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:lythaus_api_client/src/model/comment.dart';
import 'package:built_collection/built_collection.dart';
import 'package:lythaus_api_client/src/model/cursor_page.dart';
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'comment_page.g.dart';

/// CommentPage
///
/// Properties:
/// * [nextCursor] - Opaque cursor for the next page, or null when exhausted.
/// * [items]
@BuiltValue()
abstract class CommentPage implements CursorPage, Built<CommentPage, CommentPageBuilder> {
  @BuiltValueField(wireName: r'items')
  BuiltList<Comment> get items;

  CommentPage._();

  factory CommentPage([void updates(CommentPageBuilder b)]) = _$CommentPage;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(CommentPageBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<CommentPage> get serializer => _$CommentPageSerializer();
}

class _$CommentPageSerializer implements PrimitiveSerializer<CommentPage> {
  @override
  final Iterable<Type> types = const [CommentPage, _$CommentPage];

  @override
  final String wireName = r'CommentPage';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    CommentPage object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    yield r'nextCursor';
    yield object.nextCursor == null ? null : serializers.serialize(
      object.nextCursor,
      specifiedType: const FullType.nullable(String),
    );
    yield r'items';
    yield serializers.serialize(
      object.items,
      specifiedType: const FullType(BuiltList, [FullType(Comment)]),
    );
  }

  @override
  Object serialize(
    Serializers serializers,
    CommentPage object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required CommentPageBuilder result,
    required List<Object?> unhandled,
  }) {
    for (var i = 0; i < serializedList.length; i += 2) {
      final key = serializedList[i] as String;
      final value = serializedList[i + 1];
      switch (key) {
        case r'nextCursor':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType.nullable(String),
          ) as String?;
          if (valueDes == null) continue;
          result.nextCursor = valueDes;
          break;
        case r'items':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(BuiltList, [FullType(Comment)]),
          ) as BuiltList<Comment>;
          result.items.replace(valueDes);
          break;
        default:
          unhandled.add(key);
          unhandled.add(value);
          break;
      }
    }
  }

  @override
  CommentPage deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = CommentPageBuilder();
    final serializedList = (serialized as Iterable<Object?>).toList();
    final unhandled = <Object?>[];
    _deserializeProperties(
      serializers,
      serialized,
      specifiedType: specifiedType,
      serializedList: serializedList,
      unhandled: unhandled,
      result: result,
    );
    return result.build();
  }
}
