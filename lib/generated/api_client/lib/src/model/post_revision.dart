//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:built_collection/built_collection.dart';
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'post_revision.g.dart';

/// PostRevision
///
/// Properties:
/// * [id]
/// * [body]
/// * [declaredCreationMode]
/// * [visibility]
/// * [moderationState]
@BuiltValue()
abstract class PostRevision implements Built<PostRevision, PostRevisionBuilder> {
  @BuiltValueField(wireName: r'id')
  String get id;

  @BuiltValueField(wireName: r'body')
  String get body;

  @BuiltValueField(wireName: r'declaredCreationMode')
  PostRevisionDeclaredCreationModeEnum get declaredCreationMode;
  // enum declaredCreationModeEnum {  human,  ai_assisted,  };

  @BuiltValueField(wireName: r'visibility')
  PostRevisionVisibilityEnum get visibility;
  // enum visibilityEnum {  public,  followers,  private,  };

  @BuiltValueField(wireName: r'moderationState')
  PostRevisionModerationStateEnum get moderationState;
  // enum moderationStateEnum {  under_review,  };

  PostRevision._();

  factory PostRevision([void updates(PostRevisionBuilder b)]) = _$PostRevision;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(PostRevisionBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<PostRevision> get serializer => _$PostRevisionSerializer();
}

class _$PostRevisionSerializer implements PrimitiveSerializer<PostRevision> {
  @override
  final Iterable<Type> types = const [PostRevision, _$PostRevision];

  @override
  final String wireName = r'PostRevision';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    PostRevision object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    yield r'id';
    yield serializers.serialize(
      object.id,
      specifiedType: const FullType(String),
    );
    yield r'body';
    yield serializers.serialize(
      object.body,
      specifiedType: const FullType(String),
    );
    yield r'declaredCreationMode';
    yield serializers.serialize(
      object.declaredCreationMode,
      specifiedType: const FullType(PostRevisionDeclaredCreationModeEnum),
    );
    yield r'visibility';
    yield serializers.serialize(
      object.visibility,
      specifiedType: const FullType(PostRevisionVisibilityEnum),
    );
    yield r'moderationState';
    yield serializers.serialize(
      object.moderationState,
      specifiedType: const FullType(PostRevisionModerationStateEnum),
    );
  }

  @override
  Object serialize(
    Serializers serializers,
    PostRevision object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required PostRevisionBuilder result,
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
        case r'body':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.body = valueDes;
          break;
        case r'declaredCreationMode':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(PostRevisionDeclaredCreationModeEnum),
          ) as PostRevisionDeclaredCreationModeEnum;
          result.declaredCreationMode = valueDes;
          break;
        case r'visibility':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(PostRevisionVisibilityEnum),
          ) as PostRevisionVisibilityEnum;
          result.visibility = valueDes;
          break;
        case r'moderationState':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(PostRevisionModerationStateEnum),
          ) as PostRevisionModerationStateEnum;
          result.moderationState = valueDes;
          break;
        default:
          unhandled.add(key);
          unhandled.add(value);
          break;
      }
    }
  }

  @override
  PostRevision deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = PostRevisionBuilder();
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

class PostRevisionDeclaredCreationModeEnum extends EnumClass {

  @BuiltValueEnumConst(wireName: r'human')
  static const PostRevisionDeclaredCreationModeEnum human = _$postRevisionDeclaredCreationModeEnum_human;
  @BuiltValueEnumConst(wireName: r'ai_assisted')
  static const PostRevisionDeclaredCreationModeEnum aiAssisted = _$postRevisionDeclaredCreationModeEnum_aiAssisted;

  static Serializer<PostRevisionDeclaredCreationModeEnum> get serializer => _$postRevisionDeclaredCreationModeEnumSerializer;

  const PostRevisionDeclaredCreationModeEnum._(String name): super(name);

  static BuiltSet<PostRevisionDeclaredCreationModeEnum> get values => _$postRevisionDeclaredCreationModeEnumValues;
  static PostRevisionDeclaredCreationModeEnum valueOf(String name) => _$postRevisionDeclaredCreationModeEnumValueOf(name);
}

class PostRevisionVisibilityEnum extends EnumClass {

  @BuiltValueEnumConst(wireName: r'public')
  static const PostRevisionVisibilityEnum public = _$postRevisionVisibilityEnum_public;
  @BuiltValueEnumConst(wireName: r'followers')
  static const PostRevisionVisibilityEnum followers = _$postRevisionVisibilityEnum_followers;
  @BuiltValueEnumConst(wireName: r'private')
  static const PostRevisionVisibilityEnum private = _$postRevisionVisibilityEnum_private;

  static Serializer<PostRevisionVisibilityEnum> get serializer => _$postRevisionVisibilityEnumSerializer;

  const PostRevisionVisibilityEnum._(String name): super(name);

  static BuiltSet<PostRevisionVisibilityEnum> get values => _$postRevisionVisibilityEnumValues;
  static PostRevisionVisibilityEnum valueOf(String name) => _$postRevisionVisibilityEnumValueOf(name);
}

class PostRevisionModerationStateEnum extends EnumClass {

  @BuiltValueEnumConst(wireName: r'under_review')
  static const PostRevisionModerationStateEnum underReview = _$postRevisionModerationStateEnum_underReview;

  static Serializer<PostRevisionModerationStateEnum> get serializer => _$postRevisionModerationStateEnumSerializer;

  const PostRevisionModerationStateEnum._(String name): super(name);

  static BuiltSet<PostRevisionModerationStateEnum> get values => _$postRevisionModerationStateEnumValues;
  static PostRevisionModerationStateEnum valueOf(String name) => _$postRevisionModerationStateEnumValueOf(name);
}
