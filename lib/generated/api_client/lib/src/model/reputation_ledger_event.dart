//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:built_collection/built_collection.dart';
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'reputation_ledger_event.g.dart';

/// ReputationLedgerEvent
///
/// Properties:
/// * [id]
/// * [contentId]
/// * [eventType]
/// * [pillar]
/// * [impact]
/// * [status]
/// * [explanationCode]
/// * [policyVersion]
/// * [appealId]
/// * [effectiveAt]
/// * [createdAt]
@BuiltValue()
abstract class ReputationLedgerEvent implements Built<ReputationLedgerEvent, ReputationLedgerEventBuilder> {
  @BuiltValueField(wireName: r'id')
  String get id;

  @BuiltValueField(wireName: r'contentId')
  String? get contentId;

  @BuiltValueField(wireName: r'eventType')
  String get eventType;

  @BuiltValueField(wireName: r'pillar')
  ReputationLedgerEventPillarEnum? get pillar;
  // enum pillarEnum {  accountability,  contribution,  conduct,  sourcing,  authenticity,  reviewReliability,  };

  @BuiltValueField(wireName: r'impact')
  String get impact;

  @BuiltValueField(wireName: r'status')
  ReputationLedgerEventStatusEnum get status;
  // enum statusEnum {  effective,  withheld,  reversed,  expired,  };

  @BuiltValueField(wireName: r'explanationCode')
  String? get explanationCode;

  @BuiltValueField(wireName: r'policyVersion')
  String get policyVersion;

  @BuiltValueField(wireName: r'appealId')
  String? get appealId;

  @BuiltValueField(wireName: r'effectiveAt')
  DateTime get effectiveAt;

  @BuiltValueField(wireName: r'createdAt')
  DateTime get createdAt;

  ReputationLedgerEvent._();

  factory ReputationLedgerEvent([void updates(ReputationLedgerEventBuilder b)]) = _$ReputationLedgerEvent;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(ReputationLedgerEventBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<ReputationLedgerEvent> get serializer => _$ReputationLedgerEventSerializer();
}

class _$ReputationLedgerEventSerializer implements PrimitiveSerializer<ReputationLedgerEvent> {
  @override
  final Iterable<Type> types = const [ReputationLedgerEvent, _$ReputationLedgerEvent];

  @override
  final String wireName = r'ReputationLedgerEvent';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    ReputationLedgerEvent object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    yield r'id';
    yield serializers.serialize(
      object.id,
      specifiedType: const FullType(String),
    );
    if (object.contentId != null) {
      yield r'contentId';
      yield serializers.serialize(
        object.contentId,
        specifiedType: const FullType.nullable(String),
      );
    }
    yield r'eventType';
    yield serializers.serialize(
      object.eventType,
      specifiedType: const FullType(String),
    );
    if (object.pillar != null) {
      yield r'pillar';
      yield serializers.serialize(
        object.pillar,
        specifiedType: const FullType.nullable(ReputationLedgerEventPillarEnum),
      );
    }
    yield r'impact';
    yield serializers.serialize(
      object.impact,
      specifiedType: const FullType(String),
    );
    yield r'status';
    yield serializers.serialize(
      object.status,
      specifiedType: const FullType(ReputationLedgerEventStatusEnum),
    );
    if (object.explanationCode != null) {
      yield r'explanationCode';
      yield serializers.serialize(
        object.explanationCode,
        specifiedType: const FullType.nullable(String),
      );
    }
    yield r'policyVersion';
    yield serializers.serialize(
      object.policyVersion,
      specifiedType: const FullType(String),
    );
    if (object.appealId != null) {
      yield r'appealId';
      yield serializers.serialize(
        object.appealId,
        specifiedType: const FullType.nullable(String),
      );
    }
    yield r'effectiveAt';
    yield serializers.serialize(
      object.effectiveAt,
      specifiedType: const FullType(DateTime),
    );
    yield r'createdAt';
    yield serializers.serialize(
      object.createdAt,
      specifiedType: const FullType(DateTime),
    );
  }

  @override
  Object serialize(
    Serializers serializers,
    ReputationLedgerEvent object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required ReputationLedgerEventBuilder result,
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
        case r'contentId':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType.nullable(String),
          ) as String?;
          if (valueDes == null) continue;
          result.contentId = valueDes;
          break;
        case r'eventType':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.eventType = valueDes;
          break;
        case r'pillar':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType.nullable(ReputationLedgerEventPillarEnum),
          ) as ReputationLedgerEventPillarEnum?;
          if (valueDes == null) continue;
          result.pillar = valueDes;
          break;
        case r'impact':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.impact = valueDes;
          break;
        case r'status':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(ReputationLedgerEventStatusEnum),
          ) as ReputationLedgerEventStatusEnum;
          result.status = valueDes;
          break;
        case r'explanationCode':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType.nullable(String),
          ) as String?;
          if (valueDes == null) continue;
          result.explanationCode = valueDes;
          break;
        case r'policyVersion':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.policyVersion = valueDes;
          break;
        case r'appealId':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType.nullable(String),
          ) as String?;
          if (valueDes == null) continue;
          result.appealId = valueDes;
          break;
        case r'effectiveAt':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(DateTime),
          ) as DateTime;
          result.effectiveAt = valueDes;
          break;
        case r'createdAt':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(DateTime),
          ) as DateTime;
          result.createdAt = valueDes;
          break;
        default:
          unhandled.add(key);
          unhandled.add(value);
          break;
      }
    }
  }

  @override
  ReputationLedgerEvent deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = ReputationLedgerEventBuilder();
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

class ReputationLedgerEventPillarEnum extends EnumClass {

  @BuiltValueEnumConst(wireName: r'accountability')
  static const ReputationLedgerEventPillarEnum accountability = _$reputationLedgerEventPillarEnum_accountability;
  @BuiltValueEnumConst(wireName: r'contribution')
  static const ReputationLedgerEventPillarEnum contribution = _$reputationLedgerEventPillarEnum_contribution;
  @BuiltValueEnumConst(wireName: r'conduct')
  static const ReputationLedgerEventPillarEnum conduct = _$reputationLedgerEventPillarEnum_conduct;
  @BuiltValueEnumConst(wireName: r'sourcing')
  static const ReputationLedgerEventPillarEnum sourcing = _$reputationLedgerEventPillarEnum_sourcing;
  @BuiltValueEnumConst(wireName: r'authenticity')
  static const ReputationLedgerEventPillarEnum authenticity = _$reputationLedgerEventPillarEnum_authenticity;
  @BuiltValueEnumConst(wireName: r'reviewReliability')
  static const ReputationLedgerEventPillarEnum reviewReliability = _$reputationLedgerEventPillarEnum_reviewReliability;

  static Serializer<ReputationLedgerEventPillarEnum> get serializer => _$reputationLedgerEventPillarEnumSerializer;

  const ReputationLedgerEventPillarEnum._(String name): super(name);

  static BuiltSet<ReputationLedgerEventPillarEnum> get values => _$reputationLedgerEventPillarEnumValues;
  static ReputationLedgerEventPillarEnum valueOf(String name) => _$reputationLedgerEventPillarEnumValueOf(name);
}

class ReputationLedgerEventStatusEnum extends EnumClass {

  @BuiltValueEnumConst(wireName: r'effective')
  static const ReputationLedgerEventStatusEnum effective = _$reputationLedgerEventStatusEnum_effective;
  @BuiltValueEnumConst(wireName: r'withheld')
  static const ReputationLedgerEventStatusEnum withheld = _$reputationLedgerEventStatusEnum_withheld;
  @BuiltValueEnumConst(wireName: r'reversed')
  static const ReputationLedgerEventStatusEnum reversed = _$reputationLedgerEventStatusEnum_reversed;
  @BuiltValueEnumConst(wireName: r'expired')
  static const ReputationLedgerEventStatusEnum expired = _$reputationLedgerEventStatusEnum_expired;

  static Serializer<ReputationLedgerEventStatusEnum> get serializer => _$reputationLedgerEventStatusEnumSerializer;

  const ReputationLedgerEventStatusEnum._(String name): super(name);

  static BuiltSet<ReputationLedgerEventStatusEnum> get values => _$reputationLedgerEventStatusEnumValues;
  static ReputationLedgerEventStatusEnum valueOf(String name) => _$reputationLedgerEventStatusEnumValueOf(name);
}
