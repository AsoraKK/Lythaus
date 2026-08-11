//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:lythaus_api_client/src/model/declared_creation_mode.dart';
import 'package:built_collection/built_collection.dart';
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'comment_update_response.g.dart';

/// CommentUpdateResponse
///
/// Properties:
/// * [id]
/// * [body]
/// * [declaredCreationMode]
/// * [moderationState]
@BuiltValue()
abstract class CommentUpdateResponse implements Built<CommentUpdateResponse, CommentUpdateResponseBuilder> {
  @BuiltValueField(wireName: r'id')
  String get id;

  @BuiltValueField(wireName: r'body')
  String get body;

  @BuiltValueField(wireName: r'declaredCreationMode')
  DeclaredCreationMode get declaredCreationMode;
  // enum declaredCreationModeEnum {  human,  ai_assisted,  };

  @BuiltValueField(wireName: r'moderationState')
  CommentUpdateResponseModerationStateEnum get moderationState;
  // enum moderationStateEnum {  under_review,  };

  CommentUpdateResponse._();

  factory CommentUpdateResponse([void updates(CommentUpdateResponseBuilder b)]) = _$CommentUpdateResponse;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(CommentUpdateResponseBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<CommentUpdateResponse> get serializer => _$CommentUpdateResponseSerializer();
}

class _$CommentUpdateResponseSerializer implements PrimitiveSerializer<CommentUpdateResponse> {
  @override
  final Iterable<Type> types = const [CommentUpdateResponse, _$CommentUpdateResponse];

  @override
  final String wireName = r'CommentUpdateResponse';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    CommentUpdateResponse object, {
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
      specifiedType: const FullType(DeclaredCreationMode),
    );
    yield r'moderationState';
    yield serializers.serialize(
      object.moderationState,
      specifiedType: const FullType(CommentUpdateResponseModerationStateEnum),
    );
  }

  @override
  Object serialize(
    Serializers serializers,
    CommentUpdateResponse object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required CommentUpdateResponseBuilder result,
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
            specifiedType: const FullType(DeclaredCreationMode),
          ) as DeclaredCreationMode;
          result.declaredCreationMode = valueDes;
          break;
        case r'moderationState':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(CommentUpdateResponseModerationStateEnum),
          ) as CommentUpdateResponseModerationStateEnum;
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
  CommentUpdateResponse deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = CommentUpdateResponseBuilder();
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

class CommentUpdateResponseModerationStateEnum extends EnumClass {

  @BuiltValueEnumConst(wireName: r'under_review')
  static const CommentUpdateResponseModerationStateEnum underReview = _$commentUpdateResponseModerationStateEnum_underReview;

  static Serializer<CommentUpdateResponseModerationStateEnum> get serializer => _$commentUpdateResponseModerationStateEnumSerializer;

  const CommentUpdateResponseModerationStateEnum._(String name): super(name);

  static BuiltSet<CommentUpdateResponseModerationStateEnum> get values => _$commentUpdateResponseModerationStateEnumValues;
  static CommentUpdateResponseModerationStateEnum valueOf(String name) => _$commentUpdateResponseModerationStateEnumValueOf(name);
}
