//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:lythaus_api_client/src/model/owner_post.dart';
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'posts_owner_view200_response.g.dart';

/// PostsOwnerView200Response
///
/// Properties:
/// * [post]
/// * [correlationId]
@BuiltValue()
abstract class PostsOwnerView200Response implements Built<PostsOwnerView200Response, PostsOwnerView200ResponseBuilder> {
  @BuiltValueField(wireName: r'post')
  OwnerPost get post;

  @BuiltValueField(wireName: r'correlationId')
  String? get correlationId;

  PostsOwnerView200Response._();

  factory PostsOwnerView200Response([void updates(PostsOwnerView200ResponseBuilder b)]) = _$PostsOwnerView200Response;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(PostsOwnerView200ResponseBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<PostsOwnerView200Response> get serializer => _$PostsOwnerView200ResponseSerializer();
}

class _$PostsOwnerView200ResponseSerializer implements PrimitiveSerializer<PostsOwnerView200Response> {
  @override
  final Iterable<Type> types = const [PostsOwnerView200Response, _$PostsOwnerView200Response];

  @override
  final String wireName = r'PostsOwnerView200Response';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    PostsOwnerView200Response object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    yield r'post';
    yield serializers.serialize(
      object.post,
      specifiedType: const FullType(OwnerPost),
    );
    if (object.correlationId != null) {
      yield r'correlationId';
      yield serializers.serialize(
        object.correlationId,
        specifiedType: const FullType(String),
      );
    }
  }

  @override
  Object serialize(
    Serializers serializers,
    PostsOwnerView200Response object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required PostsOwnerView200ResponseBuilder result,
    required List<Object?> unhandled,
  }) {
    for (var i = 0; i < serializedList.length; i += 2) {
      final key = serializedList[i] as String;
      final value = serializedList[i + 1];
      switch (key) {
        case r'post':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(OwnerPost),
          ) as OwnerPost;
          result.post.replace(valueDes);
          break;
        case r'correlationId':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.correlationId = valueDes;
          break;
        default:
          unhandled.add(key);
          unhandled.add(value);
          break;
      }
    }
  }

  @override
  PostsOwnerView200Response deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = PostsOwnerView200ResponseBuilder();
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
