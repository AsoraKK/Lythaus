//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:built_collection/built_collection.dart';
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'owner_comment.g.dart';

/// The comment author's own body. Owning its post does not grant access; foreign parent bodies are never included.
///
/// Properties:
/// * [id]
/// * [postId]
/// * [authorId]
/// * [parentId]
/// * [depth]
/// * [body]
/// * [declaredCreationMode]
/// * [moderationState]
/// * [deleted]
/// * [createdAt]
/// * [updatedAt]
@BuiltValue()
abstract class OwnerComment implements Built<OwnerComment, OwnerCommentBuilder> {
  @BuiltValueField(wireName: r'id')
  String get id;

  @BuiltValueField(wireName: r'postId')
  String get postId;

  @BuiltValueField(wireName: r'authorId')
  String get authorId;

  @BuiltValueField(wireName: r'parentId')
  String? get parentId;

  @BuiltValueField(wireName: r'depth')
  OwnerCommentDepthEnum get depth;
  // enum depthEnum {  0,  1,  };

  @BuiltValueField(wireName: r'body')
  String get body;

  @BuiltValueField(wireName: r'declaredCreationMode')
  OwnerCommentDeclaredCreationModeEnum get declaredCreationMode;
  // enum declaredCreationModeEnum {  human,  ai_assisted,  };

  @BuiltValueField(wireName: r'moderationState')
  OwnerCommentModerationStateEnum get moderationState;
  // enum moderationStateEnum {  allowed,  under_review,  };

  @BuiltValueField(wireName: r'deleted')
  bool get deleted;

  @BuiltValueField(wireName: r'createdAt')
  DateTime get createdAt;

  @BuiltValueField(wireName: r'updatedAt')
  DateTime get updatedAt;

  OwnerComment._();

  factory OwnerComment([void updates(OwnerCommentBuilder b)]) = _$OwnerComment;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(OwnerCommentBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<OwnerComment> get serializer => _$OwnerCommentSerializer();
}

class _$OwnerCommentSerializer implements PrimitiveSerializer<OwnerComment> {
  @override
  final Iterable<Type> types = const [OwnerComment, _$OwnerComment];

  @override
  final String wireName = r'OwnerComment';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    OwnerComment object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    yield r'id';
    yield serializers.serialize(
      object.id,
      specifiedType: const FullType(String),
    );
    yield r'postId';
    yield serializers.serialize(
      object.postId,
      specifiedType: const FullType(String),
    );
    yield r'authorId';
    yield serializers.serialize(
      object.authorId,
      specifiedType: const FullType(String),
    );
    yield r'parentId';
    yield object.parentId == null ? null : serializers.serialize(
      object.parentId,
      specifiedType: const FullType.nullable(String),
    );
    yield r'depth';
    yield serializers.serialize(
      object.depth,
      specifiedType: const FullType(OwnerCommentDepthEnum),
    );
    yield r'body';
    yield serializers.serialize(
      object.body,
      specifiedType: const FullType(String),
    );
    yield r'declaredCreationMode';
    yield serializers.serialize(
      object.declaredCreationMode,
      specifiedType: const FullType(OwnerCommentDeclaredCreationModeEnum),
    );
    yield r'moderationState';
    yield serializers.serialize(
      object.moderationState,
      specifiedType: const FullType(OwnerCommentModerationStateEnum),
    );
    yield r'deleted';
    yield serializers.serialize(
      object.deleted,
      specifiedType: const FullType(bool),
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
    OwnerComment object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required OwnerCommentBuilder result,
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
        case r'postId':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.postId = valueDes;
          break;
        case r'authorId':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.authorId = valueDes;
          break;
        case r'parentId':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType.nullable(String),
          ) as String?;
          if (valueDes == null) continue;
          result.parentId = valueDes;
          break;
        case r'depth':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(OwnerCommentDepthEnum),
          ) as OwnerCommentDepthEnum;
          result.depth = valueDes;
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
            specifiedType: const FullType(OwnerCommentDeclaredCreationModeEnum),
          ) as OwnerCommentDeclaredCreationModeEnum;
          result.declaredCreationMode = valueDes;
          break;
        case r'moderationState':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(OwnerCommentModerationStateEnum),
          ) as OwnerCommentModerationStateEnum;
          result.moderationState = valueDes;
          break;
        case r'deleted':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(bool),
          ) as bool;
          result.deleted = valueDes;
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
  OwnerComment deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = OwnerCommentBuilder();
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

class OwnerCommentDepthEnum extends EnumClass {

  @BuiltValueEnumConst(wireNumber: 0)
  static const OwnerCommentDepthEnum number0 = _$ownerCommentDepthEnum_number0;
  @BuiltValueEnumConst(wireNumber: 1)
  static const OwnerCommentDepthEnum number1 = _$ownerCommentDepthEnum_number1;

  static Serializer<OwnerCommentDepthEnum> get serializer => _$ownerCommentDepthEnumSerializer;

  const OwnerCommentDepthEnum._(String name): super(name);

  static BuiltSet<OwnerCommentDepthEnum> get values => _$ownerCommentDepthEnumValues;
  static OwnerCommentDepthEnum valueOf(String name) => _$ownerCommentDepthEnumValueOf(name);
}

class OwnerCommentDeclaredCreationModeEnum extends EnumClass {

  @BuiltValueEnumConst(wireName: r'human')
  static const OwnerCommentDeclaredCreationModeEnum human = _$ownerCommentDeclaredCreationModeEnum_human;
  @BuiltValueEnumConst(wireName: r'ai_assisted')
  static const OwnerCommentDeclaredCreationModeEnum aiAssisted = _$ownerCommentDeclaredCreationModeEnum_aiAssisted;

  static Serializer<OwnerCommentDeclaredCreationModeEnum> get serializer => _$ownerCommentDeclaredCreationModeEnumSerializer;

  const OwnerCommentDeclaredCreationModeEnum._(String name): super(name);

  static BuiltSet<OwnerCommentDeclaredCreationModeEnum> get values => _$ownerCommentDeclaredCreationModeEnumValues;
  static OwnerCommentDeclaredCreationModeEnum valueOf(String name) => _$ownerCommentDeclaredCreationModeEnumValueOf(name);
}

class OwnerCommentModerationStateEnum extends EnumClass {

  @BuiltValueEnumConst(wireName: r'allowed')
  static const OwnerCommentModerationStateEnum allowed = _$ownerCommentModerationStateEnum_allowed;
  @BuiltValueEnumConst(wireName: r'under_review')
  static const OwnerCommentModerationStateEnum underReview = _$ownerCommentModerationStateEnum_underReview;

  static Serializer<OwnerCommentModerationStateEnum> get serializer => _$ownerCommentModerationStateEnumSerializer;

  const OwnerCommentModerationStateEnum._(String name): super(name);

  static BuiltSet<OwnerCommentModerationStateEnum> get values => _$ownerCommentModerationStateEnumValues;
  static OwnerCommentModerationStateEnum valueOf(String name) => _$ownerCommentModerationStateEnumValueOf(name);
}
