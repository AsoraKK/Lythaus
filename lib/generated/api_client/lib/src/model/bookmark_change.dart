//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'bookmark_change.g.dart';

/// BookmarkChange
///
/// Properties:
/// * [postId]
/// * [bookmarked]
@BuiltValue()
abstract class BookmarkChange implements Built<BookmarkChange, BookmarkChangeBuilder> {
  @BuiltValueField(wireName: r'postId')
  String get postId;

  @BuiltValueField(wireName: r'bookmarked')
  bool get bookmarked;

  BookmarkChange._();

  factory BookmarkChange([void updates(BookmarkChangeBuilder b)]) = _$BookmarkChange;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(BookmarkChangeBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<BookmarkChange> get serializer => _$BookmarkChangeSerializer();
}

class _$BookmarkChangeSerializer implements PrimitiveSerializer<BookmarkChange> {
  @override
  final Iterable<Type> types = const [BookmarkChange, _$BookmarkChange];

  @override
  final String wireName = r'BookmarkChange';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    BookmarkChange object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    yield r'postId';
    yield serializers.serialize(
      object.postId,
      specifiedType: const FullType(String),
    );
    yield r'bookmarked';
    yield serializers.serialize(
      object.bookmarked,
      specifiedType: const FullType(bool),
    );
  }

  @override
  Object serialize(
    Serializers serializers,
    BookmarkChange object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required BookmarkChangeBuilder result,
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
        case r'bookmarked':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(bool),
          ) as bool;
          result.bookmarked = valueDes;
          break;
        default:
          unhandled.add(key);
          unhandled.add(value);
          break;
      }
    }
  }

  @override
  BookmarkChange deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = BookmarkChangeBuilder();
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
