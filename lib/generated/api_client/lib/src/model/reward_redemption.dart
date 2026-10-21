//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:built_collection/built_collection.dart';
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'reward_redemption.g.dart';

/// RewardRedemption
///
/// Properties:
/// * [id]
/// * [userId]
/// * [rewardId]
/// * [rewardLevel]
/// * [rewardTitle]
/// * [redeemedAt]
/// * [status]
@BuiltValue()
abstract class RewardRedemption implements Built<RewardRedemption, RewardRedemptionBuilder> {
  @BuiltValueField(wireName: r'id')
  String get id;

  @BuiltValueField(wireName: r'userId')
  String get userId;

  @BuiltValueField(wireName: r'rewardId')
  String get rewardId;

  @BuiltValueField(wireName: r'rewardLevel')
  int get rewardLevel;

  @BuiltValueField(wireName: r'rewardTitle')
  String get rewardTitle;

  @BuiltValueField(wireName: r'redeemedAt')
  DateTime get redeemedAt;

  @BuiltValueField(wireName: r'status')
  RewardRedemptionStatusEnum get status;
  // enum statusEnum {  redeemed,  revoked,  };

  RewardRedemption._();

  factory RewardRedemption([void updates(RewardRedemptionBuilder b)]) = _$RewardRedemption;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(RewardRedemptionBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<RewardRedemption> get serializer => _$RewardRedemptionSerializer();
}

class _$RewardRedemptionSerializer implements PrimitiveSerializer<RewardRedemption> {
  @override
  final Iterable<Type> types = const [RewardRedemption, _$RewardRedemption];

  @override
  final String wireName = r'RewardRedemption';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    RewardRedemption object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    yield r'id';
    yield serializers.serialize(
      object.id,
      specifiedType: const FullType(String),
    );
    yield r'userId';
    yield serializers.serialize(
      object.userId,
      specifiedType: const FullType(String),
    );
    yield r'rewardId';
    yield serializers.serialize(
      object.rewardId,
      specifiedType: const FullType(String),
    );
    yield r'rewardLevel';
    yield serializers.serialize(
      object.rewardLevel,
      specifiedType: const FullType(int),
    );
    yield r'rewardTitle';
    yield serializers.serialize(
      object.rewardTitle,
      specifiedType: const FullType(String),
    );
    yield r'redeemedAt';
    yield serializers.serialize(
      object.redeemedAt,
      specifiedType: const FullType(DateTime),
    );
    yield r'status';
    yield serializers.serialize(
      object.status,
      specifiedType: const FullType(RewardRedemptionStatusEnum),
    );
  }

  @override
  Object serialize(
    Serializers serializers,
    RewardRedemption object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required RewardRedemptionBuilder result,
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
        case r'userId':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.userId = valueDes;
          break;
        case r'rewardId':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.rewardId = valueDes;
          break;
        case r'rewardLevel':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(int),
          ) as int;
          result.rewardLevel = valueDes;
          break;
        case r'rewardTitle':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.rewardTitle = valueDes;
          break;
        case r'redeemedAt':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(DateTime),
          ) as DateTime;
          result.redeemedAt = valueDes;
          break;
        case r'status':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(RewardRedemptionStatusEnum),
          ) as RewardRedemptionStatusEnum;
          result.status = valueDes;
          break;
        default:
          unhandled.add(key);
          unhandled.add(value);
          break;
      }
    }
  }

  @override
  RewardRedemption deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = RewardRedemptionBuilder();
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

class RewardRedemptionStatusEnum extends EnumClass {

  @BuiltValueEnumConst(wireName: r'redeemed')
  static const RewardRedemptionStatusEnum redeemed = _$rewardRedemptionStatusEnum_redeemed;

  @BuiltValueEnumConst(wireName: r'revoked')
  static const RewardRedemptionStatusEnum revoked = _$rewardRedemptionStatusEnum_revoked;

  static Serializer<RewardRedemptionStatusEnum> get serializer => _$rewardRedemptionStatusEnumSerializer;

  const RewardRedemptionStatusEnum._(String name): super(name);

  static BuiltSet<RewardRedemptionStatusEnum> get values => _$rewardRedemptionStatusEnumValues;
  static RewardRedemptionStatusEnum valueOf(String name) => _$rewardRedemptionStatusEnumValueOf(name);
}
