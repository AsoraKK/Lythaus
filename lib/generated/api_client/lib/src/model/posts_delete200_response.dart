//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'posts_delete200_response.g.dart';

/// PostsDelete200Response
///
/// Properties:
/// * [postId]
/// * [deleted]
@BuiltValue()
abstract class PostsDelete200Response implements Built<PostsDelete200Response, PostsDelete200ResponseBuilder> {
  @BuiltValueField(wireName: r'postId')
  String get postId;

  @BuiltValueField(wireName: r'deleted')
  bool get deleted;

  PostsDelete200Response._();

  factory PostsDelete200Response([void updates(PostsDelete200ResponseBuilder b)]) = _$PostsDelete200Response;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(PostsDelete200ResponseBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<PostsDelete200Response> get serializer => _$PostsDelete200ResponseSerializer();
}

class _$PostsDelete200ResponseSerializer implements PrimitiveSerializer<PostsDelete200Response> {
  @override
  final Iterable<Type> types = const [PostsDelete200Response, _$PostsDelete200Response];

  @override
  final String wireName = r'PostsDelete200Response';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    PostsDelete200Response object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    yield r'postId';
    yield serializers.serialize(
      object.postId,
      specifiedType: const FullType(String),
    );
    yield r'deleted';
    yield serializers.serialize(
      object.deleted,
      specifiedType: const FullType(bool),
    );
  }

  @override
  Object serialize(
    Serializers serializers,
    PostsDelete200Response object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required PostsDelete200ResponseBuilder result,
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
        case r'deleted':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(bool),
          ) as bool;
          result.deleted = valueDes;
          break;
        default:
          unhandled.add(key);
          unhandled.add(value);
          break;
      }
    }
  }

  @override
  PostsDelete200Response deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = PostsDelete200ResponseBuilder();
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
