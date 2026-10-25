//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:built_collection/built_collection.dart';
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'posts_comments_list503_response.g.dart';

/// PostsCommentsList503Response
///
/// Properties:
/// * [error]
@BuiltValue()
abstract class PostsCommentsList503Response implements Built<PostsCommentsList503Response, PostsCommentsList503ResponseBuilder> {
  @BuiltValueField(wireName: r'error')
  PostsCommentsList503ResponseErrorEnum get error;
  // enum errorEnum {  comment_sort_unavailable,  };

  PostsCommentsList503Response._();

  factory PostsCommentsList503Response([void updates(PostsCommentsList503ResponseBuilder b)]) = _$PostsCommentsList503Response;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(PostsCommentsList503ResponseBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<PostsCommentsList503Response> get serializer => _$PostsCommentsList503ResponseSerializer();
}

class _$PostsCommentsList503ResponseSerializer implements PrimitiveSerializer<PostsCommentsList503Response> {
  @override
  final Iterable<Type> types = const [PostsCommentsList503Response, _$PostsCommentsList503Response];

  @override
  final String wireName = r'PostsCommentsList503Response';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    PostsCommentsList503Response object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    yield r'error';
    yield serializers.serialize(
      object.error,
      specifiedType: const FullType(PostsCommentsList503ResponseErrorEnum),
    );
  }

  @override
  Object serialize(
    Serializers serializers,
    PostsCommentsList503Response object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required PostsCommentsList503ResponseBuilder result,
    required List<Object?> unhandled,
  }) {
    for (var i = 0; i < serializedList.length; i += 2) {
      final key = serializedList[i] as String;
      final value = serializedList[i + 1];
      switch (key) {
        case r'error':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(PostsCommentsList503ResponseErrorEnum),
          ) as PostsCommentsList503ResponseErrorEnum;
          result.error = valueDes;
          break;
        default:
          unhandled.add(key);
          unhandled.add(value);
          break;
      }
    }
  }

  @override
  PostsCommentsList503Response deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = PostsCommentsList503ResponseBuilder();
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

class PostsCommentsList503ResponseErrorEnum extends EnumClass {

  @BuiltValueEnumConst(wireName: r'comment_sort_unavailable')
  static const PostsCommentsList503ResponseErrorEnum commentSortUnavailable = _$postsCommentsList503ResponseErrorEnum_commentSortUnavailable;

  static Serializer<PostsCommentsList503ResponseErrorEnum> get serializer => _$postsCommentsList503ResponseErrorEnumSerializer;

  const PostsCommentsList503ResponseErrorEnum._(String name): super(name);

  static BuiltSet<PostsCommentsList503ResponseErrorEnum> get values => _$postsCommentsList503ResponseErrorEnumValues;
  static PostsCommentsList503ResponseErrorEnum valueOf(String name) => _$postsCommentsList503ResponseErrorEnumValueOf(name);
}
