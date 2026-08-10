//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'bookmark_create_request.g.dart';

/// BookmarkCreateRequest
///
/// Properties:
/// * [postId]
@BuiltValue()
abstract class BookmarkCreateRequest implements Built<BookmarkCreateRequest, BookmarkCreateRequestBuilder> {
  @BuiltValueField(wireName: r'postId')
  String get postId;

  BookmarkCreateRequest._();

  factory BookmarkCreateRequest([void updates(BookmarkCreateRequestBuilder b)]) = _$BookmarkCreateRequest;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(BookmarkCreateRequestBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<BookmarkCreateRequest> get serializer => _$BookmarkCreateRequestSerializer();
}

class _$BookmarkCreateRequestSerializer implements PrimitiveSerializer<BookmarkCreateRequest> {
  @override
  final Iterable<Type> types = const [BookmarkCreateRequest, _$BookmarkCreateRequest];

  @override
  final String wireName = r'BookmarkCreateRequest';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    BookmarkCreateRequest object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    yield r'postId';
    yield serializers.serialize(
      object.postId,
      specifiedType: const FullType(String),
    );
  }

  @override
  Object serialize(
    Serializers serializers,
    BookmarkCreateRequest object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required BookmarkCreateRequestBuilder result,
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
        default:
          unhandled.add(key);
          unhandled.add(value);
          break;
      }
    }
  }

  @override
  BookmarkCreateRequest deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = BookmarkCreateRequestBuilder();
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
