//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:built_collection/built_collection.dart';
import 'package:built_value/json_object.dart';
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'moderation_rereview_response.g.dart';

/// ModerationRereviewResponse
///
/// Properties:
/// * [caseId]
/// * [state]
/// * [moderationState]
/// * [revision]
@BuiltValue()
abstract class ModerationRereviewResponse implements Built<ModerationRereviewResponse, ModerationRereviewResponseBuilder> {
  @BuiltValueField(wireName: r'caseId')
  String get caseId;

  @BuiltValueField(wireName: r'state')
  ModerationRereviewResponseStateEnum get state;
  // enum stateEnum {  open,  };

  @BuiltValueField(wireName: r'moderationState')
  ModerationRereviewResponseModerationStateEnum get moderationState;
  // enum moderationStateEnum {  under_review,  };

  @BuiltValueField(wireName: r'revision')
  JsonObject? get revision;

  ModerationRereviewResponse._();

  factory ModerationRereviewResponse([void updates(ModerationRereviewResponseBuilder b)]) = _$ModerationRereviewResponse;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(ModerationRereviewResponseBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<ModerationRereviewResponse> get serializer => _$ModerationRereviewResponseSerializer();
}

class _$ModerationRereviewResponseSerializer implements PrimitiveSerializer<ModerationRereviewResponse> {
  @override
  final Iterable<Type> types = const [ModerationRereviewResponse, _$ModerationRereviewResponse];

  @override
  final String wireName = r'ModerationRereviewResponse';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    ModerationRereviewResponse object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    yield r'caseId';
    yield serializers.serialize(
      object.caseId,
      specifiedType: const FullType(String),
    );
    yield r'state';
    yield serializers.serialize(
      object.state,
      specifiedType: const FullType(ModerationRereviewResponseStateEnum),
    );
    yield r'moderationState';
    yield serializers.serialize(
      object.moderationState,
      specifiedType: const FullType(ModerationRereviewResponseModerationStateEnum),
    );
    yield r'revision';
    yield object.revision == null ? null : serializers.serialize(
      object.revision,
      specifiedType: const FullType.nullable(JsonObject),
    );
  }

  @override
  Object serialize(
    Serializers serializers,
    ModerationRereviewResponse object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required ModerationRereviewResponseBuilder result,
    required List<Object?> unhandled,
  }) {
    for (var i = 0; i < serializedList.length; i += 2) {
      final key = serializedList[i] as String;
      final value = serializedList[i + 1];
      switch (key) {
        case r'caseId':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.caseId = valueDes;
          break;
        case r'state':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(ModerationRereviewResponseStateEnum),
          ) as ModerationRereviewResponseStateEnum;
          result.state = valueDes;
          break;
        case r'moderationState':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(ModerationRereviewResponseModerationStateEnum),
          ) as ModerationRereviewResponseModerationStateEnum;
          result.moderationState = valueDes;
          break;
        case r'revision':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType.nullable(JsonObject),
          ) as JsonObject?;
          if (valueDes == null) continue;
          result.revision = valueDes;
          break;
        default:
          unhandled.add(key);
          unhandled.add(value);
          break;
      }
    }
  }

  @override
  ModerationRereviewResponse deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = ModerationRereviewResponseBuilder();
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

class ModerationRereviewResponseStateEnum extends EnumClass {

  @BuiltValueEnumConst(wireName: r'open')
  static const ModerationRereviewResponseStateEnum open = _$moderationRereviewResponseStateEnum_open;

  static Serializer<ModerationRereviewResponseStateEnum> get serializer => _$moderationRereviewResponseStateEnumSerializer;

  const ModerationRereviewResponseStateEnum._(String name): super(name);

  static BuiltSet<ModerationRereviewResponseStateEnum> get values => _$moderationRereviewResponseStateEnumValues;
  static ModerationRereviewResponseStateEnum valueOf(String name) => _$moderationRereviewResponseStateEnumValueOf(name);
}

class ModerationRereviewResponseModerationStateEnum extends EnumClass {

  @BuiltValueEnumConst(wireName: r'under_review')
  static const ModerationRereviewResponseModerationStateEnum underReview = _$moderationRereviewResponseModerationStateEnum_underReview;

  static Serializer<ModerationRereviewResponseModerationStateEnum> get serializer => _$moderationRereviewResponseModerationStateEnumSerializer;

  const ModerationRereviewResponseModerationStateEnum._(String name): super(name);

  static BuiltSet<ModerationRereviewResponseModerationStateEnum> get values => _$moderationRereviewResponseModerationStateEnumValues;
  static ModerationRereviewResponseModerationStateEnum valueOf(String name) => _$moderationRereviewResponseModerationStateEnumValueOf(name);
}
