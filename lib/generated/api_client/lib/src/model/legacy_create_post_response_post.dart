//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:lythaus_api_client/src/model/legacy_create_post_response_post_stats.dart';
import 'package:lythaus_api_client/src/model/public_authorship.dart';
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'legacy_create_post_response_post.g.dart';

/// LegacyCreatePostResponsePost
///
/// Properties:
/// * [postId]
/// * [text]
/// * [mediaUrl]
/// * [authorId]
/// * [createdAt]
/// * [updatedAt]
/// * [stats]
/// * [authorship]
@BuiltValue()
abstract class LegacyCreatePostResponsePost implements Built<LegacyCreatePostResponsePost, LegacyCreatePostResponsePostBuilder> {
  @BuiltValueField(wireName: r'postId')
  String get postId;

  @BuiltValueField(wireName: r'text')
  String get text;

  @BuiltValueField(wireName: r'mediaUrl')
  String? get mediaUrl;

  @BuiltValueField(wireName: r'authorId')
  String? get authorId;

  @BuiltValueField(wireName: r'createdAt')
  DateTime get createdAt;

  @BuiltValueField(wireName: r'updatedAt')
  DateTime get updatedAt;

  @BuiltValueField(wireName: r'stats')
  LegacyCreatePostResponsePostStats get stats;

  @BuiltValueField(wireName: r'authorship')
  PublicAuthorship get authorship;

  LegacyCreatePostResponsePost._();

  factory LegacyCreatePostResponsePost([void updates(LegacyCreatePostResponsePostBuilder b)]) = _$LegacyCreatePostResponsePost;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(LegacyCreatePostResponsePostBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<LegacyCreatePostResponsePost> get serializer => _$LegacyCreatePostResponsePostSerializer();
}

class _$LegacyCreatePostResponsePostSerializer implements PrimitiveSerializer<LegacyCreatePostResponsePost> {
  @override
  final Iterable<Type> types = const [LegacyCreatePostResponsePost, _$LegacyCreatePostResponsePost];

  @override
  final String wireName = r'LegacyCreatePostResponsePost';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    LegacyCreatePostResponsePost object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    yield r'postId';
    yield serializers.serialize(
      object.postId,
      specifiedType: const FullType(String),
    );
    yield r'text';
    yield serializers.serialize(
      object.text,
      specifiedType: const FullType(String),
    );
    yield r'mediaUrl';
    yield object.mediaUrl == null ? null : serializers.serialize(
      object.mediaUrl,
      specifiedType: const FullType.nullable(String),
    );
    yield r'authorId';
    yield object.authorId == null ? null : serializers.serialize(
      object.authorId,
      specifiedType: const FullType.nullable(String),
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
    yield r'stats';
    yield serializers.serialize(
      object.stats,
      specifiedType: const FullType(LegacyCreatePostResponsePostStats),
    );
    yield r'authorship';
    yield serializers.serialize(
      object.authorship,
      specifiedType: const FullType(PublicAuthorship),
    );
  }

  @override
  Object serialize(
    Serializers serializers,
    LegacyCreatePostResponsePost object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required LegacyCreatePostResponsePostBuilder result,
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
        case r'text':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.text = valueDes;
          break;
        case r'mediaUrl':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType.nullable(String),
          ) as String?;
          if (valueDes == null) continue;
          result.mediaUrl = valueDes;
          break;
        case r'authorId':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType.nullable(String),
          ) as String?;
          if (valueDes == null) continue;
          result.authorId = valueDes;
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
        case r'stats':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(LegacyCreatePostResponsePostStats),
          ) as LegacyCreatePostResponsePostStats;
          result.stats.replace(valueDes);
          break;
        case r'authorship':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(PublicAuthorship),
          ) as PublicAuthorship;
          result.authorship.replace(valueDes);
          break;
        default:
          unhandled.add(key);
          unhandled.add(value);
          break;
      }
    }
  }

  @override
  LegacyCreatePostResponsePost deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = LegacyCreatePostResponsePostBuilder();
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
