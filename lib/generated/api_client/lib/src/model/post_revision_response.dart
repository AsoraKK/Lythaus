//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:lythaus_api_client/src/model/post_revision.dart';
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'post_revision_response.g.dart';

/// PostRevisionResponse
///
/// Properties:
/// * [post]
@BuiltValue()
abstract class PostRevisionResponse implements Built<PostRevisionResponse, PostRevisionResponseBuilder> {
  @BuiltValueField(wireName: r'post')
  PostRevision get post;

  PostRevisionResponse._();

  factory PostRevisionResponse([void updates(PostRevisionResponseBuilder b)]) = _$PostRevisionResponse;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(PostRevisionResponseBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<PostRevisionResponse> get serializer => _$PostRevisionResponseSerializer();
}

class _$PostRevisionResponseSerializer implements PrimitiveSerializer<PostRevisionResponse> {
  @override
  final Iterable<Type> types = const [PostRevisionResponse, _$PostRevisionResponse];

  @override
  final String wireName = r'PostRevisionResponse';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    PostRevisionResponse object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    yield r'post';
    yield serializers.serialize(
      object.post,
      specifiedType: const FullType(PostRevision),
    );
  }

  @override
  Object serialize(
    Serializers serializers,
    PostRevisionResponse object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required PostRevisionResponseBuilder result,
    required List<Object?> unhandled,
  }) {
    for (var i = 0; i < serializedList.length; i += 2) {
      final key = serializedList[i] as String;
      final value = serializedList[i + 1];
      switch (key) {
        case r'post':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(PostRevision),
          ) as PostRevision;
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
  PostRevisionResponse deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = PostRevisionResponseBuilder();
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
