//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:lythaus_api_client/src/model/declared_creation_mode.dart';
import 'package:built_collection/built_collection.dart';
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'comment_submission.g.dart';

/// A comment or reply is accepted for moderation and is not immediately public.
///
/// Properties:
/// * [id]
/// * [commentId]
/// * [postId]
/// * [parentId]
/// * [body]
/// * [depth]
/// * [declaredCreationMode]
/// * [moderationState]
@BuiltValue()
abstract class CommentSubmission implements Built<CommentSubmission, CommentSubmissionBuilder> {
  @BuiltValueField(wireName: r'id')
  String get id;

  @BuiltValueField(wireName: r'commentId')
  String get commentId;

  @BuiltValueField(wireName: r'postId')
  String get postId;

  @BuiltValueField(wireName: r'parentId')
  String? get parentId;

  @BuiltValueField(wireName: r'body')
  String get body;

  @BuiltValueField(wireName: r'depth')
  CommentSubmissionDepthEnum get depth;
  // enum depthEnum {  0,  1,  };

  @BuiltValueField(wireName: r'declaredCreationMode')
  DeclaredCreationMode get declaredCreationMode;
  // enum declaredCreationModeEnum {  human,  ai_assisted,  };

  @BuiltValueField(wireName: r'moderationState')
  CommentSubmissionModerationStateEnum get moderationState;
  // enum moderationStateEnum {  under_review,  };

  CommentSubmission._();

  factory CommentSubmission([void updates(CommentSubmissionBuilder b)]) = _$CommentSubmission;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(CommentSubmissionBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<CommentSubmission> get serializer => _$CommentSubmissionSerializer();
}

class _$CommentSubmissionSerializer implements PrimitiveSerializer<CommentSubmission> {
  @override
  final Iterable<Type> types = const [CommentSubmission, _$CommentSubmission];

  @override
  final String wireName = r'CommentSubmission';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    CommentSubmission object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    yield r'id';
    yield serializers.serialize(
      object.id,
      specifiedType: const FullType(String),
    );
    yield r'commentId';
    yield serializers.serialize(
      object.commentId,
      specifiedType: const FullType(String),
    );
    yield r'postId';
    yield serializers.serialize(
      object.postId,
      specifiedType: const FullType(String),
    );
    if (object.parentId != null) {
      yield r'parentId';
      yield serializers.serialize(
        object.parentId,
        specifiedType: const FullType.nullable(String),
      );
    }
    yield r'body';
    yield serializers.serialize(
      object.body,
      specifiedType: const FullType(String),
    );
    yield r'depth';
    yield serializers.serialize(
      object.depth,
      specifiedType: const FullType(CommentSubmissionDepthEnum),
    );
    yield r'declaredCreationMode';
    yield serializers.serialize(
      object.declaredCreationMode,
      specifiedType: const FullType(DeclaredCreationMode),
    );
    yield r'moderationState';
    yield serializers.serialize(
      object.moderationState,
      specifiedType: const FullType(CommentSubmissionModerationStateEnum),
    );
  }

  @override
  Object serialize(
    Serializers serializers,
    CommentSubmission object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required CommentSubmissionBuilder result,
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
        case r'commentId':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.commentId = valueDes;
          break;
        case r'postId':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.postId = valueDes;
          break;
        case r'parentId':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType.nullable(String),
          ) as String?;
          if (valueDes == null) continue;
          result.parentId = valueDes;
          break;
        case r'body':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.body = valueDes;
          break;
        case r'depth':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(CommentSubmissionDepthEnum),
          ) as CommentSubmissionDepthEnum;
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
            specifiedType: const FullType(CommentSubmissionModerationStateEnum),
          ) as CommentSubmissionModerationStateEnum;
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
  CommentSubmission deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = CommentSubmissionBuilder();
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

class CommentSubmissionDepthEnum extends EnumClass {

  @BuiltValueEnumConst(wireNumber: 0)
  static const CommentSubmissionDepthEnum number0 = _$commentSubmissionDepthEnum_number0;
  @BuiltValueEnumConst(wireNumber: 1)
  static const CommentSubmissionDepthEnum number1 = _$commentSubmissionDepthEnum_number1;

  static Serializer<CommentSubmissionDepthEnum> get serializer => _$commentSubmissionDepthEnumSerializer;

  const CommentSubmissionDepthEnum._(String name): super(name);

  static BuiltSet<CommentSubmissionDepthEnum> get values => _$commentSubmissionDepthEnumValues;
  static CommentSubmissionDepthEnum valueOf(String name) => _$commentSubmissionDepthEnumValueOf(name);
}

class CommentSubmissionModerationStateEnum extends EnumClass {

  @BuiltValueEnumConst(wireName: r'under_review')
  static const CommentSubmissionModerationStateEnum underReview = _$commentSubmissionModerationStateEnum_underReview;

  static Serializer<CommentSubmissionModerationStateEnum> get serializer => _$commentSubmissionModerationStateEnumSerializer;

  const CommentSubmissionModerationStateEnum._(String name): super(name);

  static BuiltSet<CommentSubmissionModerationStateEnum> get values => _$commentSubmissionModerationStateEnumValues;
  static CommentSubmissionModerationStateEnum valueOf(String name) => _$commentSubmissionModerationStateEnumValueOf(name);
}
