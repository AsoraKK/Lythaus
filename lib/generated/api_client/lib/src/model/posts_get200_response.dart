//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:lythaus_api_client/src/model/personal_feed_item.dart';
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'posts_get200_response.g.dart';

/// PostsGet200Response
///
/// Properties:
/// * [post]
@BuiltValue()
abstract class PostsGet200Response implements Built<PostsGet200Response, PostsGet200ResponseBuilder> {
  @BuiltValueField(wireName: r'post')
  PersonalFeedItem get post;

  PostsGet200Response._();

  factory PostsGet200Response([void updates(PostsGet200ResponseBuilder b)]) = _$PostsGet200Response;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(PostsGet200ResponseBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<PostsGet200Response> get serializer => _$PostsGet200ResponseSerializer();
}

class _$PostsGet200ResponseSerializer implements PrimitiveSerializer<PostsGet200Response> {
  @override
  final Iterable<Type> types = const [PostsGet200Response, _$PostsGet200Response];

  @override
  final String wireName = r'PostsGet200Response';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    PostsGet200Response object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    yield r'post';
    yield serializers.serialize(
      object.post,
      specifiedType: const FullType(PersonalFeedItem),
    );
  }

  @override
  Object serialize(
    Serializers serializers,
    PostsGet200Response object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required PostsGet200ResponseBuilder result,
    required List<Object?> unhandled,
  }) {
    for (var i = 0; i < serializedList.length; i += 2) {
      final key = serializedList[i] as String;
      final value = serializedList[i + 1];
      switch (key) {
        case r'post':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(PersonalFeedItem),
          ) as PersonalFeedItem;
          result.post.replace(valueDes);
          break;
        default:
          unhandled.add(key);
          unhandled.add(value);
          break;
      }
    }
  }

  @override
  PostsGet200Response deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = PostsGet200ResponseBuilder();
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
