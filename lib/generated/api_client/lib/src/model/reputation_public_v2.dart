//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:built_collection/built_collection.dart';
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'reputation_public_v2.g.dart';

/// ReputationPublicV2
///
/// Properties:
/// * [userId]
/// * [level]
/// * [reputationLevel]
/// * [levelName]
/// * [reputationStatus]
/// * [reputationBand]
/// * [policyVersion]
@BuiltValue(instantiable: false)
abstract class ReputationPublicV2  {
  @BuiltValueField(wireName: r'userId')
  String get userId;

  @BuiltValueField(wireName: r'level')
  int get level;

  @BuiltValueField(wireName: r'reputationLevel')
  int get reputationLevel;

  @BuiltValueField(wireName: r'levelName')
  String get levelName;

  @BuiltValueField(wireName: r'reputationStatus')
  ReputationPublicV2ReputationStatusEnum get reputationStatus;
  // enum reputationStatusEnum {  active,  restricted,  suspended,  under_investigation,  };

  @BuiltValueField(wireName: r'reputationBand')
  ReputationPublicV2ReputationBandEnum get reputationBand;
  // enum reputationBandEnum {  new,  accountable,  trusted,  established,  };

  @BuiltValueField(wireName: r'policyVersion')
  String get policyVersion;

  @BuiltValueSerializer(custom: true)
  static Serializer<ReputationPublicV2> get serializer => _$ReputationPublicV2Serializer();
}

class _$ReputationPublicV2Serializer implements PrimitiveSerializer<ReputationPublicV2> {
  @override
  final Iterable<Type> types = const [ReputationPublicV2];

  @override
  final String wireName = r'ReputationPublicV2';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    ReputationPublicV2 object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    yield r'userId';
    yield serializers.serialize(
      object.userId,
      specifiedType: const FullType(String),
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
    yield r'levelName';
    yield serializers.serialize(
      object.levelName,
      specifiedType: const FullType(String),
    );
    yield r'reputationStatus';
    yield serializers.serialize(
      object.reputationStatus,
      specifiedType: const FullType(ReputationPublicV2ReputationStatusEnum),
    );
    yield r'reputationBand';
    yield serializers.serialize(
      object.reputationBand,
      specifiedType: const FullType(ReputationPublicV2ReputationBandEnum),
    );
    yield r'policyVersion';
    yield serializers.serialize(
      object.policyVersion,
      specifiedType: const FullType(String),
    );
  }

  @override
  Object serialize(
    Serializers serializers,
    ReputationPublicV2 object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  @override
  ReputationPublicV2 deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return serializers.deserialize(serialized, specifiedType: FullType($ReputationPublicV2)) as $ReputationPublicV2;
  }
}

/// a concrete implementation of [ReputationPublicV2], since [ReputationPublicV2] is not instantiable
@BuiltValue(instantiable: true)
abstract class $ReputationPublicV2 implements ReputationPublicV2, Built<$ReputationPublicV2, $ReputationPublicV2Builder> {
  $ReputationPublicV2._();

  factory $ReputationPublicV2([void Function($ReputationPublicV2Builder)? updates]) = _$$ReputationPublicV2;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults($ReputationPublicV2Builder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<$ReputationPublicV2> get serializer => _$$ReputationPublicV2Serializer();
}

class _$$ReputationPublicV2Serializer implements PrimitiveSerializer<$ReputationPublicV2> {
  @override
  final Iterable<Type> types = const [$ReputationPublicV2, _$$ReputationPublicV2];

  @override
  final String wireName = r'$ReputationPublicV2';

  @override
  Object serialize(
    Serializers serializers,
    $ReputationPublicV2 object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return serializers.serialize(object, specifiedType: FullType(ReputationPublicV2))!;
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required ReputationPublicV2Builder result,
    required List<Object?> unhandled,
  }) {
    for (var i = 0; i < serializedList.length; i += 2) {
      final key = serializedList[i] as String;
      final value = serializedList[i + 1];
      switch (key) {
        case r'userId':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.userId = valueDes;
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
        case r'levelName':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.levelName = valueDes;
          break;
        case r'reputationStatus':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(ReputationPublicV2ReputationStatusEnum),
          ) as ReputationPublicV2ReputationStatusEnum;
          result.reputationStatus = valueDes;
          break;
        case r'reputationBand':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(ReputationPublicV2ReputationBandEnum),
          ) as ReputationPublicV2ReputationBandEnum;
          result.reputationBand = valueDes;
          break;
        case r'policyVersion':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.policyVersion = valueDes;
          break;
        default:
          unhandled.add(key);
          unhandled.add(value);
          break;
      }
    }
  }

  @override
  $ReputationPublicV2 deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = $ReputationPublicV2Builder();
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

class ReputationPublicV2ReputationStatusEnum extends EnumClass {

  @BuiltValueEnumConst(wireName: r'active')
  static const ReputationPublicV2ReputationStatusEnum active = _$reputationPublicV2ReputationStatusEnum_active;
  @BuiltValueEnumConst(wireName: r'restricted')
  static const ReputationPublicV2ReputationStatusEnum restricted = _$reputationPublicV2ReputationStatusEnum_restricted;
  @BuiltValueEnumConst(wireName: r'suspended')
  static const ReputationPublicV2ReputationStatusEnum suspended = _$reputationPublicV2ReputationStatusEnum_suspended;
  @BuiltValueEnumConst(wireName: r'under_investigation')
  static const ReputationPublicV2ReputationStatusEnum underInvestigation = _$reputationPublicV2ReputationStatusEnum_underInvestigation;

  static Serializer<ReputationPublicV2ReputationStatusEnum> get serializer => _$reputationPublicV2ReputationStatusEnumSerializer;

  const ReputationPublicV2ReputationStatusEnum._(String name): super(name);

  static BuiltSet<ReputationPublicV2ReputationStatusEnum> get values => _$reputationPublicV2ReputationStatusEnumValues;
  static ReputationPublicV2ReputationStatusEnum valueOf(String name) => _$reputationPublicV2ReputationStatusEnumValueOf(name);
}

class ReputationPublicV2ReputationBandEnum extends EnumClass {

  @BuiltValueEnumConst(wireName: r'new')
  static const ReputationPublicV2ReputationBandEnum new_ = _$reputationPublicV2ReputationBandEnum_new_;
  @BuiltValueEnumConst(wireName: r'accountable')
  static const ReputationPublicV2ReputationBandEnum accountable = _$reputationPublicV2ReputationBandEnum_accountable;
  @BuiltValueEnumConst(wireName: r'trusted')
  static const ReputationPublicV2ReputationBandEnum trusted = _$reputationPublicV2ReputationBandEnum_trusted;
  @BuiltValueEnumConst(wireName: r'established')
  static const ReputationPublicV2ReputationBandEnum established = _$reputationPublicV2ReputationBandEnum_established;

  static Serializer<ReputationPublicV2ReputationBandEnum> get serializer => _$reputationPublicV2ReputationBandEnumSerializer;

  const ReputationPublicV2ReputationBandEnum._(String name): super(name);

  static BuiltSet<ReputationPublicV2ReputationBandEnum> get values => _$reputationPublicV2ReputationBandEnumValues;
  static ReputationPublicV2ReputationBandEnum valueOf(String name) => _$reputationPublicV2ReputationBandEnumValueOf(name);
}
