//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'bookmark_list_items_inner.g.dart';

/// BookmarkListItemsInner
///
/// Properties:
/// * [postId]
/// * [createdAt]
@BuiltValue()
abstract class BookmarkListItemsInner implements Built<BookmarkListItemsInner, BookmarkListItemsInnerBuilder> {
  @BuiltValueField(wireName: r'postId')
  String get postId;

  @BuiltValueField(wireName: r'createdAt')
  DateTime get createdAt;

  BookmarkListItemsInner._();

  factory BookmarkListItemsInner([void updates(BookmarkListItemsInnerBuilder b)]) = _$BookmarkListItemsInner;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(BookmarkListItemsInnerBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<BookmarkListItemsInner> get serializer => _$BookmarkListItemsInnerSerializer();
}

class _$BookmarkListItemsInnerSerializer implements PrimitiveSerializer<BookmarkListItemsInner> {
  @override
  final Iterable<Type> types = const [BookmarkListItemsInner, _$BookmarkListItemsInner];

  @override
  final String wireName = r'BookmarkListItemsInner';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    BookmarkListItemsInner object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    yield r'postId';
    yield serializers.serialize(
      object.postId,
      specifiedType: const FullType(String),
    );
    yield r'createdAt';
    yield serializers.serialize(
      object.createdAt,
      specifiedType: const FullType(DateTime),
    );
  }

  @override
  Object serialize(
    Serializers serializers,
    BookmarkListItemsInner object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required BookmarkListItemsInnerBuilder result,
    required List<Object?> unhandled,
  }) {
    for (var i = 0; i < serializedList.length; i += 2) {
      final key = serializedList[i] as String;
      final value = serializedList[i + 1];
      switch (key) {
        case r'postId':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.postId = valueDes;
          break;
        case r'createdAt':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(DateTime),
          ) as DateTime;
          result.createdAt = valueDes;
          break;
        default:
          unhandled.add(key);
          unhandled.add(value);
          break;
      }
    }
  }

  @override
  BookmarkListItemsInner deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = BookmarkListItemsInnerBuilder();
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
