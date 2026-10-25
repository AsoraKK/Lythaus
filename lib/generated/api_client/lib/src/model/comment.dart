//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:lythaus_api_client/src/model/declared_creation_mode.dart';
import 'package:built_collection/built_collection.dart';
import 'package:lythaus_api_client/src/model/moderation_state.dart';
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'comment.g.dart';

/// Comment
///
/// Properties:
/// * [id]
/// * [authorId]
/// * [parentId]
/// * [conversationId] - Canonical top-level comment for this conversation.
/// * [replyCount] - Visible non-deleted descendant replies for a root conversation at the page snapshot. Includes nested replies; excludes hidden and pending contributions. Reply rows report zero.
/// * [replyToAuthorId]
/// * [replyToDeleted]
/// * [body]
/// * [depth]
/// * [declaredCreationMode]
/// * [moderationState]
/// * [deleted]
/// * [createdAt]
/// * [updatedAt]
@BuiltValue()
abstract class Comment implements Built<Comment, CommentBuilder> {
  @BuiltValueField(wireName: r'id')
  String get id;

  @BuiltValueField(wireName: r'authorId')
  String get authorId;

  @BuiltValueField(wireName: r'parentId')
  String? get parentId;

  /// Canonical top-level comment for this conversation.
  @BuiltValueField(wireName: r'conversationId')
  String? get conversationId;

  /// Visible non-deleted descendant replies for a root conversation at the page snapshot. Includes nested replies; excludes hidden and pending contributions. Reply rows report zero.
  @BuiltValueField(wireName: r'replyCount')
  int? get replyCount;

  @BuiltValueField(wireName: r'replyToAuthorId')
  String? get replyToAuthorId;

  @BuiltValueField(wireName: r'replyToDeleted')
  bool? get replyToDeleted;

  @BuiltValueField(wireName: r'body')
  String? get body;

  @BuiltValueField(wireName: r'depth')
  CommentDepthEnum get depth;
  // enum depthEnum {  0,  1,  };

  @BuiltValueField(wireName: r'declaredCreationMode')
  DeclaredCreationMode get declaredCreationMode;
  // enum declaredCreationModeEnum {  human,  ai_assisted,  };

  @BuiltValueField(wireName: r'moderationState')
  ModerationState get moderationState;
  // enum moderationStateEnum {  under_review,  allowed,  blocked,  };

  @BuiltValueField(wireName: r'deleted')
  bool get deleted;

  @BuiltValueField(wireName: r'createdAt')
  DateTime get createdAt;

  @BuiltValueField(wireName: r'updatedAt')
  DateTime? get updatedAt;

  Comment._();

  factory Comment([void updates(CommentBuilder b)]) = _$Comment;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(CommentBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<Comment> get serializer => _$CommentSerializer();
}

class _$CommentSerializer implements PrimitiveSerializer<Comment> {
  @override
  final Iterable<Type> types = const [Comment, _$Comment];

  @override
  final String wireName = r'Comment';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    Comment object, {
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
    if (object.parentId != null) {
      yield r'parentId';
      yield serializers.serialize(
        object.parentId,
        specifiedType: const FullType.nullable(String),
      );
    }
    if (object.conversationId != null) {
      yield r'conversationId';
      yield serializers.serialize(
        object.conversationId,
        specifiedType: const FullType(String),
      );
    }
    if (object.replyCount != null) {
      yield r'replyCount';
      yield serializers.serialize(
        object.replyCount,
        specifiedType: const FullType(int),
      );
    }
    if (object.replyToAuthorId != null) {
      yield r'replyToAuthorId';
      yield serializers.serialize(
        object.replyToAuthorId,
        specifiedType: const FullType.nullable(String),
      );
    }
    if (object.replyToDeleted != null) {
      yield r'replyToDeleted';
      yield serializers.serialize(
        object.replyToDeleted,
        specifiedType: const FullType(bool),
      );
    }
    yield r'body';
    yield object.body == null ? null : serializers.serialize(
      object.body,
      specifiedType: const FullType.nullable(String),
    );
    yield r'depth';
    yield serializers.serialize(
      object.depth,
      specifiedType: const FullType(CommentDepthEnum),
    );
    yield r'declaredCreationMode';
    yield serializers.serialize(
      object.declaredCreationMode,
      specifiedType: const FullType(DeclaredCreationMode),
    );
    yield r'moderationState';
    yield serializers.serialize(
      object.moderationState,
      specifiedType: const FullType(ModerationState),
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
    if (object.updatedAt != null) {
      yield r'updatedAt';
      yield serializers.serialize(
        object.updatedAt,
        specifiedType: const FullType(DateTime),
      );
    }
  }

  @override
  Object serialize(
    Serializers serializers,
    Comment object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required CommentBuilder result,
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
        case r'parentId':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType.nullable(String),
          ) as String?;
          if (valueDes == null) continue;
          result.parentId = valueDes;
          break;
        case r'conversationId':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.conversationId = valueDes;
          break;
        case r'replyCount':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(int),
          ) as int;
          result.replyCount = valueDes;
          break;
        case r'replyToAuthorId':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType.nullable(String),
          ) as String?;
          if (valueDes == null) continue;
          result.replyToAuthorId = valueDes;
          break;
        case r'replyToDeleted':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(bool),
          ) as bool;
          result.replyToDeleted = valueDes;
          break;
        case r'body':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType.nullable(String),
          ) as String?;
          if (valueDes == null) continue;
          result.body = valueDes;
          break;
        case r'depth':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(CommentDepthEnum),
          ) as CommentDepthEnum;
          result.depth = valueDes;
          break;
        case r'declaredCreationMode':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(DeclaredCreationMode),
          ) as DeclaredCreationMode;
          result.declaredCreationMode = valueDes;
          break;
        case r'moderationState':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(ModerationState),
          ) as ModerationState;
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
  Comment deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = CommentBuilder();
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

class CommentDepthEnum extends EnumClass {

  @BuiltValueEnumConst(wireNumber: 0)
  static const CommentDepthEnum number0 = _$commentDepthEnum_number0;
  @BuiltValueEnumConst(wireNumber: 1)
  static const CommentDepthEnum number1 = _$commentDepthEnum_number1;

  static Serializer<CommentDepthEnum> get serializer => _$commentDepthEnumSerializer;

  const CommentDepthEnum._(String name): super(name);

  static BuiltSet<CommentDepthEnum> get values => _$commentDepthEnumValues;
  static CommentDepthEnum valueOf(String name) => _$commentDepthEnumValueOf(name);
}
