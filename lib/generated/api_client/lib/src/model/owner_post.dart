//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:built_collection/built_collection.dart';
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'owner_post.g.dart';

/// Private author-only view. A declaration is not a confirmed public authenticity label.
///
/// Properties:
/// * [id]
/// * [authorId]
/// * [body]
/// * [declaredCreationMode]
/// * [moderationState]
/// * [visibility]
/// * [createdAt]
/// * [updatedAt]
@BuiltValue()
abstract class OwnerPost implements Built<OwnerPost, OwnerPostBuilder> {
  @BuiltValueField(wireName: r'id')
  String get id;

  @BuiltValueField(wireName: r'authorId')
  String get authorId;

  @BuiltValueField(wireName: r'body')
  String get body;

  @BuiltValueField(wireName: r'declaredCreationMode')
  OwnerPostDeclaredCreationModeEnum get declaredCreationMode;
  // enum declaredCreationModeEnum {  human,  ai_assisted,  };

  @BuiltValueField(wireName: r'moderationState')
  OwnerPostModerationStateEnum get moderationState;
  // enum moderationStateEnum {  allowed,  under_review,  };

  @BuiltValueField(wireName: r'visibility')
  OwnerPostVisibilityEnum get visibility;
  // enum visibilityEnum {  public,  followers,  private,  };

  @BuiltValueField(wireName: r'createdAt')
  DateTime get createdAt;

  @BuiltValueField(wireName: r'updatedAt')
  DateTime get updatedAt;

  OwnerPost._();

  factory OwnerPost([void updates(OwnerPostBuilder b)]) = _$OwnerPost;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(OwnerPostBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<OwnerPost> get serializer => _$OwnerPostSerializer();
}

class _$OwnerPostSerializer implements PrimitiveSerializer<OwnerPost> {
  @override
  final Iterable<Type> types = const [OwnerPost, _$OwnerPost];

  @override
  final String wireName = r'OwnerPost';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    OwnerPost object, {
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
      specifiedType: const FullType(OwnerPostDeclaredCreationModeEnum),
    );
    yield r'moderationState';
    yield serializers.serialize(
      object.moderationState,
      specifiedType: const FullType(OwnerPostModerationStateEnum),
    );
    yield r'visibility';
    yield serializers.serialize(
      object.visibility,
      specifiedType: const FullType(OwnerPostVisibilityEnum),
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
    OwnerPost object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required OwnerPostBuilder result,
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
            specifiedType: const FullType(OwnerPostDeclaredCreationModeEnum),
          ) as OwnerPostDeclaredCreationModeEnum;
          result.declaredCreationMode = valueDes;
          break;
        case r'moderationState':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(OwnerPostModerationStateEnum),
          ) as OwnerPostModerationStateEnum;
          result.moderationState = valueDes;
          break;
        case r'visibility':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(OwnerPostVisibilityEnum),
          ) as OwnerPostVisibilityEnum;
          result.visibility = valueDes;
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
  OwnerPost deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = OwnerPostBuilder();
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

class OwnerPostDeclaredCreationModeEnum extends EnumClass {

  @BuiltValueEnumConst(wireName: r'human')
  static const OwnerPostDeclaredCreationModeEnum human = _$ownerPostDeclaredCreationModeEnum_human;
  @BuiltValueEnumConst(wireName: r'ai_assisted')
  static const OwnerPostDeclaredCreationModeEnum aiAssisted = _$ownerPostDeclaredCreationModeEnum_aiAssisted;

  static Serializer<OwnerPostDeclaredCreationModeEnum> get serializer => _$ownerPostDeclaredCreationModeEnumSerializer;

  const OwnerPostDeclaredCreationModeEnum._(String name): super(name);

  static BuiltSet<OwnerPostDeclaredCreationModeEnum> get values => _$ownerPostDeclaredCreationModeEnumValues;
  static OwnerPostDeclaredCreationModeEnum valueOf(String name) => _$ownerPostDeclaredCreationModeEnumValueOf(name);
}

class OwnerPostModerationStateEnum extends EnumClass {

  @BuiltValueEnumConst(wireName: r'allowed')
  static const OwnerPostModerationStateEnum allowed = _$ownerPostModerationStateEnum_allowed;
  @BuiltValueEnumConst(wireName: r'under_review')
  static const OwnerPostModerationStateEnum underReview = _$ownerPostModerationStateEnum_underReview;

  static Serializer<OwnerPostModerationStateEnum> get serializer => _$ownerPostModerationStateEnumSerializer;

  const OwnerPostModerationStateEnum._(String name): super(name);

  static BuiltSet<OwnerPostModerationStateEnum> get values => _$ownerPostModerationStateEnumValues;
  static OwnerPostModerationStateEnum valueOf(String name) => _$ownerPostModerationStateEnumValueOf(name);
}

class OwnerPostVisibilityEnum extends EnumClass {

  @BuiltValueEnumConst(wireName: r'public')
  static const OwnerPostVisibilityEnum public = _$ownerPostVisibilityEnum_public;
  @BuiltValueEnumConst(wireName: r'followers')
  static const OwnerPostVisibilityEnum followers = _$ownerPostVisibilityEnum_followers;
  @BuiltValueEnumConst(wireName: r'private')
  static const OwnerPostVisibilityEnum private = _$ownerPostVisibilityEnum_private;

  static Serializer<OwnerPostVisibilityEnum> get serializer => _$ownerPostVisibilityEnumSerializer;

  const OwnerPostVisibilityEnum._(String name): super(name);

  static BuiltSet<OwnerPostVisibilityEnum> get values => _$ownerPostVisibilityEnumValues;
  static OwnerPostVisibilityEnum valueOf(String name) => _$ownerPostVisibilityEnumValueOf(name);
}
