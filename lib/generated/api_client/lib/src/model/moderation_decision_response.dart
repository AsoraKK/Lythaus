//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:built_collection/built_collection.dart';
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'moderation_decision_response.g.dart';

/// ModerationDecisionResponse
///
/// Properties:
/// * [caseId]
/// * [outcome]
/// * [publicLabel]
@BuiltValue()
abstract class ModerationDecisionResponse implements Built<ModerationDecisionResponse, ModerationDecisionResponseBuilder> {
  @BuiltValueField(wireName: r'caseId')
  String get caseId;

  @BuiltValueField(wireName: r'outcome')
  ModerationDecisionResponseOutcomeEnum get outcome;
  // enum outcomeEnum {  allow,  block,  queue,  };

  @BuiltValueField(wireName: r'publicLabel')
  String? get publicLabel;

  ModerationDecisionResponse._();

  factory ModerationDecisionResponse([void updates(ModerationDecisionResponseBuilder b)]) = _$ModerationDecisionResponse;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(ModerationDecisionResponseBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<ModerationDecisionResponse> get serializer => _$ModerationDecisionResponseSerializer();
}

class _$ModerationDecisionResponseSerializer implements PrimitiveSerializer<ModerationDecisionResponse> {
  @override
  final Iterable<Type> types = const [ModerationDecisionResponse, _$ModerationDecisionResponse];

  @override
  final String wireName = r'ModerationDecisionResponse';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    ModerationDecisionResponse object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    yield r'caseId';
    yield serializers.serialize(
      object.caseId,
      specifiedType: const FullType(String),
    );
    yield r'outcome';
    yield serializers.serialize(
      object.outcome,
      specifiedType: const FullType(ModerationDecisionResponseOutcomeEnum),
    );
    if (object.publicLabel != null) {
      yield r'publicLabel';
      yield serializers.serialize(
        object.publicLabel,
        specifiedType: const FullType.nullable(String),
      );
    }
  }

  @override
  Object serialize(
    Serializers serializers,
    ModerationDecisionResponse object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required ModerationDecisionResponseBuilder result,
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
        case r'outcome':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(ModerationDecisionResponseOutcomeEnum),
          ) as ModerationDecisionResponseOutcomeEnum;
          result.outcome = valueDes;
          break;
        case r'publicLabel':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType.nullable(String),
          ) as String?;
          if (valueDes == null) continue;
          result.publicLabel = valueDes;
          break;
        default:
          unhandled.add(key);
          unhandled.add(value);
          break;
      }
    }
  }

  @override
  ModerationDecisionResponse deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = ModerationDecisionResponseBuilder();
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

class ModerationDecisionResponseOutcomeEnum extends EnumClass {

  @BuiltValueEnumConst(wireName: r'allow')
  static const ModerationDecisionResponseOutcomeEnum allow = _$moderationDecisionResponseOutcomeEnum_allow;
  @BuiltValueEnumConst(wireName: r'block')
  static const ModerationDecisionResponseOutcomeEnum block = _$moderationDecisionResponseOutcomeEnum_block;
  @BuiltValueEnumConst(wireName: r'queue')
  static const ModerationDecisionResponseOutcomeEnum queue = _$moderationDecisionResponseOutcomeEnum_queue;

  static Serializer<ModerationDecisionResponseOutcomeEnum> get serializer => _$moderationDecisionResponseOutcomeEnumSerializer;

  const ModerationDecisionResponseOutcomeEnum._(String name): super(name);

  static BuiltSet<ModerationDecisionResponseOutcomeEnum> get values => _$moderationDecisionResponseOutcomeEnumValues;
  static ModerationDecisionResponseOutcomeEnum valueOf(String name) => _$moderationDecisionResponseOutcomeEnumValueOf(name);
}
