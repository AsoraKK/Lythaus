//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:built_collection/built_collection.dart';
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'owner_timeline_post.g.dart';

/// Private author-only timeline item. Only allowed or under-review, non-deleted human or AI-assisted posts are returned.
///
/// Properties:
/// * [id]
/// * [authorId]
/// * [body]
/// * [declaredCreationMode]
/// * [moderationState]
/// * [visibility]
/// * [publishedAt]
/// * [createdAt]
/// * [updatedAt]
@BuiltValue()
abstract class OwnerTimelinePost implements Built<OwnerTimelinePost, OwnerTimelinePostBuilder> {
  @BuiltValueField(wireName: r'id')
  String get id;

  @BuiltValueField(wireName: r'authorId')
  String get authorId;

  @BuiltValueField(wireName: r'body')
  String get body;

  @BuiltValueField(wireName: r'declaredCreationMode')
  OwnerTimelinePostDeclaredCreationModeEnum get declaredCreationMode;
  // enum declaredCreationModeEnum {  human,  ai_assisted,  };

  @BuiltValueField(wireName: r'moderationState')
  OwnerTimelinePostModerationStateEnum get moderationState;
  // enum moderationStateEnum {  allowed,  under_review,  };

  @BuiltValueField(wireName: r'visibility')
  OwnerTimelinePostVisibilityEnum get visibility;
  // enum visibilityEnum {  public,  followers,  private,  };

  @BuiltValueField(wireName: r'publishedAt')
  DateTime? get publishedAt;

  @BuiltValueField(wireName: r'createdAt')
  DateTime get createdAt;

  @BuiltValueField(wireName: r'updatedAt')
  DateTime get updatedAt;

  OwnerTimelinePost._();

  factory OwnerTimelinePost([void updates(OwnerTimelinePostBuilder b)]) = _$OwnerTimelinePost;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(OwnerTimelinePostBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<OwnerTimelinePost> get serializer => _$OwnerTimelinePostSerializer();
}

class _$OwnerTimelinePostSerializer implements PrimitiveSerializer<OwnerTimelinePost> {
  @override
  final Iterable<Type> types = const [OwnerTimelinePost, _$OwnerTimelinePost];

  @override
  final String wireName = r'OwnerTimelinePost';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    OwnerTimelinePost object, {
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
    yield r'body';
    yield serializers.serialize(
      object.body,
      specifiedType: const FullType(String),
    );
    yield r'declaredCreationMode';
    yield serializers.serialize(
      object.declaredCreationMode,
      specifiedType: const FullType(OwnerTimelinePostDeclaredCreationModeEnum),
    );
    yield r'moderationState';
    yield serializers.serialize(
      object.moderationState,
      specifiedType: const FullType(OwnerTimelinePostModerationStateEnum),
    );
    yield r'visibility';
    yield serializers.serialize(
      object.visibility,
      specifiedType: const FullType(OwnerTimelinePostVisibilityEnum),
    );
    yield r'publishedAt';
    yield object.publishedAt == null ? null : serializers.serialize(
      object.publishedAt,
      specifiedType: const FullType.nullable(DateTime),
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
    OwnerTimelinePost object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required OwnerTimelinePostBuilder result,
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
            specifiedType: const FullType(OwnerTimelinePostDeclaredCreationModeEnum),
          ) as OwnerTimelinePostDeclaredCreationModeEnum;
          result.declaredCreationMode = valueDes;
          break;
        case r'moderationState':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(OwnerTimelinePostModerationStateEnum),
          ) as OwnerTimelinePostModerationStateEnum;
          result.moderationState = valueDes;
          break;
        case r'visibility':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(OwnerTimelinePostVisibilityEnum),
          ) as OwnerTimelinePostVisibilityEnum;
          result.visibility = valueDes;
          break;
        case r'publishedAt':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType.nullable(DateTime),
          ) as DateTime?;
          if (valueDes == null) continue;
          result.publishedAt = valueDes;
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
  OwnerTimelinePost deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = OwnerTimelinePostBuilder();
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

class OwnerTimelinePostDeclaredCreationModeEnum extends EnumClass {

  @BuiltValueEnumConst(wireName: r'human')
  static const OwnerTimelinePostDeclaredCreationModeEnum human = _$ownerTimelinePostDeclaredCreationModeEnum_human;
  @BuiltValueEnumConst(wireName: r'ai_assisted')
  static const OwnerTimelinePostDeclaredCreationModeEnum aiAssisted = _$ownerTimelinePostDeclaredCreationModeEnum_aiAssisted;

  static Serializer<OwnerTimelinePostDeclaredCreationModeEnum> get serializer => _$ownerTimelinePostDeclaredCreationModeEnumSerializer;

  const OwnerTimelinePostDeclaredCreationModeEnum._(String name): super(name);

  static BuiltSet<OwnerTimelinePostDeclaredCreationModeEnum> get values => _$ownerTimelinePostDeclaredCreationModeEnumValues;
  static OwnerTimelinePostDeclaredCreationModeEnum valueOf(String name) => _$ownerTimelinePostDeclaredCreationModeEnumValueOf(name);
}

class OwnerTimelinePostModerationStateEnum extends EnumClass {

  @BuiltValueEnumConst(wireName: r'allowed')
  static const OwnerTimelinePostModerationStateEnum allowed = _$ownerTimelinePostModerationStateEnum_allowed;
  @BuiltValueEnumConst(wireName: r'under_review')
  static const OwnerTimelinePostModerationStateEnum underReview = _$ownerTimelinePostModerationStateEnum_underReview;

  static Serializer<OwnerTimelinePostModerationStateEnum> get serializer => _$ownerTimelinePostModerationStateEnumSerializer;

  const OwnerTimelinePostModerationStateEnum._(String name): super(name);

  static BuiltSet<OwnerTimelinePostModerationStateEnum> get values => _$ownerTimelinePostModerationStateEnumValues;
  static OwnerTimelinePostModerationStateEnum valueOf(String name) => _$ownerTimelinePostModerationStateEnumValueOf(name);
}

class OwnerTimelinePostVisibilityEnum extends EnumClass {

  @BuiltValueEnumConst(wireName: r'public')
  static const OwnerTimelinePostVisibilityEnum public = _$ownerTimelinePostVisibilityEnum_public;
  @BuiltValueEnumConst(wireName: r'followers')
  static const OwnerTimelinePostVisibilityEnum followers = _$ownerTimelinePostVisibilityEnum_followers;
  @BuiltValueEnumConst(wireName: r'private')
  static const OwnerTimelinePostVisibilityEnum private = _$ownerTimelinePostVisibilityEnum_private;

  static Serializer<OwnerTimelinePostVisibilityEnum> get serializer => _$ownerTimelinePostVisibilityEnumSerializer;

  const OwnerTimelinePostVisibilityEnum._(String name): super(name);

  static BuiltSet<OwnerTimelinePostVisibilityEnum> get values => _$ownerTimelinePostVisibilityEnumValues;
  static OwnerTimelinePostVisibilityEnum valueOf(String name) => _$ownerTimelinePostVisibilityEnumValueOf(name);
}
