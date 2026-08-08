//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:built_collection/built_collection.dart';
import 'package:lythaus_api_client/src/model/public_authorship.dart';
import 'package:lythaus_api_client/src/model/news_source_metadata.dart';
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'post.g.dart';

/// Post
///
/// Properties:
/// * [id]
/// * [authorId]
/// * [content]
/// * [contentType]
/// * [mediaUrls]
/// * [topics]
/// * [visibility]
/// * [isNews]
/// * [source_]
/// * [clusterId]
/// * [authorship]
/// * [createdAt]
/// * [updatedAt]
@BuiltValue(instantiable: false)
abstract class Post  {
  @BuiltValueField(wireName: r'id')
  String get id;

  @BuiltValueField(wireName: r'authorId')
  String get authorId;

  @BuiltValueField(wireName: r'content')
  String get content;

  @BuiltValueField(wireName: r'contentType')
  PostContentTypeEnum get contentType;
  // enum contentTypeEnum {  text,  image,  video,  mixed,  };

  @BuiltValueField(wireName: r'mediaUrls')
  BuiltList<String>? get mediaUrls;

  @BuiltValueField(wireName: r'topics')
  BuiltList<String>? get topics;

  @BuiltValueField(wireName: r'visibility')
  PostVisibilityEnum get visibility;
  // enum visibilityEnum {  public,  followers,  private,  };

  @BuiltValueField(wireName: r'isNews')
  bool get isNews;

  @BuiltValueField(wireName: r'source')
  NewsSourceMetadata? get source_;

  @BuiltValueField(wireName: r'clusterId')
  String? get clusterId;

  @BuiltValueField(wireName: r'authorship')
  PublicAuthorship get authorship;

  @BuiltValueField(wireName: r'createdAt')
  DateTime get createdAt;

  @BuiltValueField(wireName: r'updatedAt')
  DateTime get updatedAt;

  @BuiltValueSerializer(custom: true)
  static Serializer<Post> get serializer => _$PostSerializer();
}

class _$PostSerializer implements PrimitiveSerializer<Post> {
  @override
  final Iterable<Type> types = const [Post];

  @override
  final String wireName = r'Post';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    Post object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    yield r'id';
    yield serializers.serialize(
      object.id,
      specifiedType: const FullType(String),
    );
    yield r'authorId';
    yield serializers.serialize(
      object.authorId,
      specifiedType: const FullType(String),
    );
    yield r'content';
    yield serializers.serialize(
      object.content,
      specifiedType: const FullType(String),
    );
    yield r'contentType';
    yield serializers.serialize(
      object.contentType,
      specifiedType: const FullType(PostContentTypeEnum),
    );
    if (object.mediaUrls != null) {
      yield r'mediaUrls';
      yield serializers.serialize(
        object.mediaUrls,
        specifiedType: const FullType(BuiltList, [FullType(String)]),
      );
    }
    if (object.topics != null) {
      yield r'topics';
      yield serializers.serialize(
        object.topics,
        specifiedType: const FullType(BuiltList, [FullType(String)]),
      );
    }
    yield r'visibility';
    yield serializers.serialize(
      object.visibility,
      specifiedType: const FullType(PostVisibilityEnum),
    );
    yield r'isNews';
    yield serializers.serialize(
      object.isNews,
      specifiedType: const FullType(bool),
    );
    if (object.source_ != null) {
      yield r'source';
      yield serializers.serialize(
        object.source_,
        specifiedType: const FullType(NewsSourceMetadata),
      );
    }
    if (object.clusterId != null) {
      yield r'clusterId';
      yield serializers.serialize(
        object.clusterId,
        specifiedType: const FullType(String),
      );
    }
    yield r'authorship';
    yield serializers.serialize(
      object.authorship,
      specifiedType: const FullType(PublicAuthorship),
    );
    yield r'createdAt';
    yield serializers.serialize(
      object.createdAt,
      specifiedType: const FullType(DateTime),
    );
    yield r'updatedAt';
    yield serializers.serialize(
      object.updatedAt,
      specifiedType: const FullType(DateTime),
    );
  }

  @override
  Object serialize(
    Serializers serializers,
    Post object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  @override
  Post deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return serializers.deserialize(serialized, specifiedType: FullType($Post)) as $Post;
  }
}

/// a concrete implementation of [Post], since [Post] is not instantiable
@BuiltValue(instantiable: true)
abstract class $Post implements Post, Built<$Post, $PostBuilder> {
  $Post._();

  factory $Post([void Function($PostBuilder)? updates]) = _$$Post;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults($PostBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<$Post> get serializer => _$$PostSerializer();
}

class _$$PostSerializer implements PrimitiveSerializer<$Post> {
  @override
  final Iterable<Type> types = const [$Post, _$$Post];

  @override
  final String wireName = r'$Post';

  @override
  Object serialize(
    Serializers serializers,
    $Post object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return serializers.serialize(object, specifiedType: FullType(Post))!;
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required PostBuilder result,
    required List<Object?> unhandled,
  }) {
    for (var i = 0; i < serializedList.length; i += 2) {
      final key = serializedList[i] as String;
      final value = serializedList[i + 1];
      switch (key) {
        case r'id':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.id = valueDes;
          break;
        case r'authorId':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.authorId = valueDes;
          break;
        case r'content':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.content = valueDes;
          break;
        case r'contentType':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(PostContentTypeEnum),
          ) as PostContentTypeEnum;
          result.contentType = valueDes;
          break;
        case r'mediaUrls':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(BuiltList, [FullType(String)]),
          ) as BuiltList<String>;
          result.mediaUrls.replace(valueDes);
          break;
        case r'topics':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(BuiltList, [FullType(String)]),
          ) as BuiltList<String>;
          result.topics.replace(valueDes);
          break;
        case r'visibility':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(PostVisibilityEnum),
          ) as PostVisibilityEnum;
          result.visibility = valueDes;
          break;
        case r'isNews':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(bool),
          ) as bool;
          result.isNews = valueDes;
          break;
        case r'source':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(NewsSourceMetadata),
          ) as NewsSourceMetadata;
          result.source_.replace(valueDes);
          break;
        case r'clusterId':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.clusterId = valueDes;
          break;
        case r'authorship':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(PublicAuthorship),
          ) as PublicAuthorship;
          result.authorship.replace(valueDes);
          break;
        case r'createdAt':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(DateTime),
          ) as DateTime;
          result.createdAt = valueDes;
          break;
        case r'updatedAt':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(DateTime),
          ) as DateTime;
          result.updatedAt = valueDes;
          break;
        default:
          unhandled.add(key);
          unhandled.add(value);
          break;
      }
    }
  }

  @override
  $Post deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = $PostBuilder();
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

class PostContentTypeEnum extends EnumClass {

  @BuiltValueEnumConst(wireName: r'text')
  static const PostContentTypeEnum text = _$postContentTypeEnum_text;
  @BuiltValueEnumConst(wireName: r'image')
  static const PostContentTypeEnum image = _$postContentTypeEnum_image;
  @BuiltValueEnumConst(wireName: r'video')
  static const PostContentTypeEnum video = _$postContentTypeEnum_video;
  @BuiltValueEnumConst(wireName: r'mixed')
  static const PostContentTypeEnum mixed = _$postContentTypeEnum_mixed;

  static Serializer<PostContentTypeEnum> get serializer => _$postContentTypeEnumSerializer;

  const PostContentTypeEnum._(String name): super(name);

  static BuiltSet<PostContentTypeEnum> get values => _$postContentTypeEnumValues;
  static PostContentTypeEnum valueOf(String name) => _$postContentTypeEnumValueOf(name);
}

class PostVisibilityEnum extends EnumClass {

  @BuiltValueEnumConst(wireName: r'public')
  static const PostVisibilityEnum public = _$postVisibilityEnum_public;
  @BuiltValueEnumConst(wireName: r'followers')
  static const PostVisibilityEnum followers = _$postVisibilityEnum_followers;
  @BuiltValueEnumConst(wireName: r'private')
  static const PostVisibilityEnum private = _$postVisibilityEnum_private;

  static Serializer<PostVisibilityEnum> get serializer => _$postVisibilityEnumSerializer;

  const PostVisibilityEnum._(String name): super(name);

  static BuiltSet<PostVisibilityEnum> get values => _$postVisibilityEnumValues;
  static PostVisibilityEnum valueOf(String name) => _$postVisibilityEnumValueOf(name);
}
