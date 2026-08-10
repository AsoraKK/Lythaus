//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:lythaus_api_client/src/model/reputation_public_v2.dart';
import 'package:lythaus_api_client/src/model/reputation_pillars.dart';
import 'package:built_collection/built_collection.dart';
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'reputation_private_v2.g.dart';

/// ReputationPrivateV2
///
/// Properties:
/// * [userId]
/// * [level]
/// * [reputationLevel]
/// * [levelName]
/// * [reputationStatus]
/// * [reputationBand]
/// * [policyVersion]
/// * [pillars]
/// * [promotionBlockers]
/// * [evaluatedAt]
@BuiltValue()
abstract class ReputationPrivateV2 implements ReputationPublicV2, Built<ReputationPrivateV2, ReputationPrivateV2Builder> {
  @BuiltValueField(wireName: r'pillars')
  ReputationPillars get pillars;

  @BuiltValueField(wireName: r'evaluatedAt')
  DateTime? get evaluatedAt;

  @BuiltValueField(wireName: r'promotionBlockers')
  BuiltList<String> get promotionBlockers;

  ReputationPrivateV2._();

  factory ReputationPrivateV2([void updates(ReputationPrivateV2Builder b)]) = _$ReputationPrivateV2;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(ReputationPrivateV2Builder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<ReputationPrivateV2> get serializer => _$ReputationPrivateV2Serializer();
}

class _$ReputationPrivateV2Serializer implements PrimitiveSerializer<ReputationPrivateV2> {
  @override
  final Iterable<Type> types = const [ReputationPrivateV2, _$ReputationPrivateV2];

  @override
  final String wireName = r'ReputationPrivateV2';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    ReputationPrivateV2 object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    yield r'policyVersion';
    yield serializers.serialize(
      object.policyVersion,
      specifiedType: const FullType(String),
    );
    yield r'pillars';
    yield serializers.serialize(
      object.pillars,
      specifiedType: const FullType(ReputationPillars),
    );
    yield r'level';
    yield serializers.serialize(
      object.level,
      specifiedType: const FullType(int),
    );
    yield r'reputationLevel';
    yield serializers.serialize(
      object.reputationLevel,
      specifiedType: const FullType(int),
    );
    yield r'reputationBand';
    yield serializers.serialize(
      object.reputationBand,
      specifiedType: const FullType(ReputationPublicV2ReputationBandEnum),
    );
    yield r'reputationStatus';
    yield serializers.serialize(
      object.reputationStatus,
      specifiedType: const FullType(ReputationPublicV2ReputationStatusEnum),
    );
    yield r'levelName';
    yield serializers.serialize(
      object.levelName,
      specifiedType: const FullType(String),
    );
    yield r'evaluatedAt';
    yield object.evaluatedAt == null ? null : serializers.serialize(
      object.evaluatedAt,
      specifiedType: const FullType.nullable(DateTime),
    );
    yield r'promotionBlockers';
    yield serializers.serialize(
      object.promotionBlockers,
      specifiedType: const FullType(BuiltList, [FullType(String)]),
    );
    yield r'userId';
    yield serializers.serialize(
      object.userId,
      specifiedType: const FullType(String),
    );
  }

  @override
  Object serialize(
    Serializers serializers,
    ReputationPrivateV2 object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required ReputationPrivateV2Builder result,
    required List<Object?> unhandled,
  }) {
    for (var i = 0; i < serializedList.length; i += 2) {
      final key = serializedList[i] as String;
      final value = serializedList[i + 1];
      switch (key) {
        case r'policyVersion':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.policyVersion = valueDes;
          break;
        case r'pillars':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(ReputationPillars),
          ) as ReputationPillars;
          result.pillars.replace(valueDes);
          break;
        case r'level':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(int),
          ) as int;
          result.level = valueDes;
          break;
        case r'reputationLevel':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(int),
          ) as int;
          result.reputationLevel = valueDes;
          break;
        case r'reputationBand':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(ReputationPublicV2ReputationBandEnum),
          ) as ReputationPublicV2ReputationBandEnum;
          result.reputationBand = valueDes;
          break;
        case r'reputationStatus':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(ReputationPublicV2ReputationStatusEnum),
          ) as ReputationPublicV2ReputationStatusEnum;
          result.reputationStatus = valueDes;
          break;
        case r'levelName':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.levelName = valueDes;
          break;
        case r'evaluatedAt':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType.nullable(DateTime),
          ) as DateTime?;
          if (valueDes == null) continue;
          result.evaluatedAt = valueDes;
          break;
        case r'promotionBlockers':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(BuiltList, [FullType(String)]),
          ) as BuiltList<String>;
          result.promotionBlockers.replace(valueDes);
          break;
        case r'userId':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.userId = valueDes;
          break;
        default:
          unhandled.add(key);
          unhandled.add(value);
          break;
      }
    }
  }

  @override
  ReputationPrivateV2 deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = ReputationPrivateV2Builder();
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

class ReputationPrivateV2ReputationStatusEnum extends EnumClass {

  @BuiltValueEnumConst(wireName: r'active')
  static const ReputationPrivateV2ReputationStatusEnum active = _$reputationPrivateV2ReputationStatusEnum_active;
  @BuiltValueEnumConst(wireName: r'restricted')
  static const ReputationPrivateV2ReputationStatusEnum restricted = _$reputationPrivateV2ReputationStatusEnum_restricted;
  @BuiltValueEnumConst(wireName: r'suspended')
  static const ReputationPrivateV2ReputationStatusEnum suspended = _$reputationPrivateV2ReputationStatusEnum_suspended;
  @BuiltValueEnumConst(wireName: r'under_investigation')
  static const ReputationPrivateV2ReputationStatusEnum underInvestigation = _$reputationPrivateV2ReputationStatusEnum_underInvestigation;

  static Serializer<ReputationPrivateV2ReputationStatusEnum> get serializer => _$reputationPrivateV2ReputationStatusEnumSerializer;

  const ReputationPrivateV2ReputationStatusEnum._(String name): super(name);

  static BuiltSet<ReputationPrivateV2ReputationStatusEnum> get values => _$reputationPrivateV2ReputationStatusEnumValues;
  static ReputationPrivateV2ReputationStatusEnum valueOf(String name) => _$reputationPrivateV2ReputationStatusEnumValueOf(name);
}

class ReputationPrivateV2ReputationBandEnum extends EnumClass {

  @BuiltValueEnumConst(wireName: r'new')
  static const ReputationPrivateV2ReputationBandEnum new_ = _$reputationPrivateV2ReputationBandEnum_new_;
  @BuiltValueEnumConst(wireName: r'accountable')
  static const ReputationPrivateV2ReputationBandEnum accountable = _$reputationPrivateV2ReputationBandEnum_accountable;
  @BuiltValueEnumConst(wireName: r'trusted')
  static const ReputationPrivateV2ReputationBandEnum trusted = _$reputationPrivateV2ReputationBandEnum_trusted;
  @BuiltValueEnumConst(wireName: r'established')
  static const ReputationPrivateV2ReputationBandEnum established = _$reputationPrivateV2ReputationBandEnum_established;

  static Serializer<ReputationPrivateV2ReputationBandEnum> get serializer => _$reputationPrivateV2ReputationBandEnumSerializer;

  const ReputationPrivateV2ReputationBandEnum._(String name): super(name);

  static BuiltSet<ReputationPrivateV2ReputationBandEnum> get values => _$reputationPrivateV2ReputationBandEnumValues;
  static ReputationPrivateV2ReputationBandEnum valueOf(String name) => _$reputationPrivateV2ReputationBandEnumValueOf(name);
}
