//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:built_collection/built_collection.dart';
import 'package:lythaus_api_client/src/model/reward_offer.dart';
import 'package:lythaus_api_client/src/model/reward_redemption.dart';
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'rewards_me_response.g.dart';

/// RewardsMeResponse
///
/// Properties:
/// * [subscriptionTier]
/// * [reputationLevel]
/// * [reputationBand]
/// * [availableRewardLevels]
/// * [maxOptionsPerLevel]
/// * [redemptionStatus]
/// * [fraudRiskStatus]
/// * [offers]
/// * [redemptionHistory]
/// * [affiliateDisclosure]
@BuiltValue()
abstract class RewardsMeResponse implements Built<RewardsMeResponse, RewardsMeResponseBuilder> {
  @BuiltValueField(wireName: r'subscriptionTier')
  RewardsMeResponseSubscriptionTierEnum get subscriptionTier;
  // enum subscriptionTierEnum {  guest,  free,  premium,  black,  editorial,  };

  @BuiltValueField(wireName: r'reputationLevel')
  int get reputationLevel;

  @BuiltValueField(wireName: r'reputationBand')
  String get reputationBand;

  @BuiltValueField(wireName: r'availableRewardLevels')
  BuiltList<int> get availableRewardLevels;

  @BuiltValueField(wireName: r'maxOptionsPerLevel')
  int get maxOptionsPerLevel;

  @BuiltValueField(wireName: r'redemptionStatus')
  RewardsMeResponseRedemptionStatusEnum get redemptionStatus;
  // enum redemptionStatusEnum {  active,  restricted,  };

  @BuiltValueField(wireName: r'fraudRiskStatus')
  String get fraudRiskStatus;

  @BuiltValueField(wireName: r'offers')
  BuiltList<RewardOffer> get offers;

  @BuiltValueField(wireName: r'redemptionHistory')
  BuiltList<RewardRedemption> get redemptionHistory;

  @BuiltValueField(wireName: r'affiliateDisclosure')
  String get affiliateDisclosure;

  RewardsMeResponse._();

  factory RewardsMeResponse([void updates(RewardsMeResponseBuilder b)]) = _$RewardsMeResponse;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(RewardsMeResponseBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<RewardsMeResponse> get serializer => _$RewardsMeResponseSerializer();
}

class _$RewardsMeResponseSerializer implements PrimitiveSerializer<RewardsMeResponse> {
  @override
  final Iterable<Type> types = const [RewardsMeResponse, _$RewardsMeResponse];

  @override
  final String wireName = r'RewardsMeResponse';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    RewardsMeResponse object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    yield r'subscriptionTier';
    yield serializers.serialize(
      object.subscriptionTier,
      specifiedType: const FullType(RewardsMeResponseSubscriptionTierEnum),
    );
    yield r'reputationLevel';
    yield serializers.serialize(
      object.reputationLevel,
      specifiedType: const FullType(int),
    );
    yield r'reputationBand';
    yield serializers.serialize(
      object.reputationBand,
      specifiedType: const FullType(String),
    );
    yield r'availableRewardLevels';
    yield serializers.serialize(
      object.availableRewardLevels,
      specifiedType: const FullType(BuiltList, [FullType(int)]),
    );
    yield r'maxOptionsPerLevel';
    yield serializers.serialize(
      object.maxOptionsPerLevel,
      specifiedType: const FullType(int),
    );
    yield r'redemptionStatus';
    yield serializers.serialize(
      object.redemptionStatus,
      specifiedType: const FullType(RewardsMeResponseRedemptionStatusEnum),
    );
    yield r'fraudRiskStatus';
    yield serializers.serialize(
      object.fraudRiskStatus,
      specifiedType: const FullType(String),
    );
    yield r'offers';
    yield serializers.serialize(
      object.offers,
      specifiedType: const FullType(BuiltList, [FullType(RewardOffer)]),
    );
    yield r'redemptionHistory';
    yield serializers.serialize(
      object.redemptionHistory,
      specifiedType: const FullType(BuiltList, [FullType(RewardRedemption)]),
    );
    yield r'affiliateDisclosure';
    yield serializers.serialize(
      object.affiliateDisclosure,
      specifiedType: const FullType(String),
    );
  }

  @override
  Object serialize(
    Serializers serializers,
    RewardsMeResponse object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required RewardsMeResponseBuilder result,
    required List<Object?> unhandled,
  }) {
    for (var i = 0; i < serializedList.length; i += 2) {
      final key = serializedList[i] as String;
      final value = serializedList[i + 1];
      switch (key) {
        case r'subscriptionTier':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(RewardsMeResponseSubscriptionTierEnum),
          ) as RewardsMeResponseSubscriptionTierEnum;
          result.subscriptionTier = valueDes;
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
            specifiedType: const FullType(String),
          ) as String;
          result.reputationBand = valueDes;
          break;
        case r'availableRewardLevels':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(BuiltList, [FullType(int)]),
          ) as BuiltList<int>;
          result.availableRewardLevels.replace(valueDes);
          break;
        case r'maxOptionsPerLevel':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(int),
          ) as int;
          result.maxOptionsPerLevel = valueDes;
          break;
        case r'redemptionStatus':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(RewardsMeResponseRedemptionStatusEnum),
          ) as RewardsMeResponseRedemptionStatusEnum;
          result.redemptionStatus = valueDes;
          break;
        case r'fraudRiskStatus':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.fraudRiskStatus = valueDes;
          break;
        case r'offers':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(BuiltList, [FullType(RewardOffer)]),
          ) as BuiltList<RewardOffer>;
          result.offers.replace(valueDes);
          break;
        case r'redemptionHistory':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(BuiltList, [FullType(RewardRedemption)]),
          ) as BuiltList<RewardRedemption>;
          result.redemptionHistory.replace(valueDes);
          break;
        case r'affiliateDisclosure':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.affiliateDisclosure = valueDes;
          break;
        default:
          unhandled.add(key);
          unhandled.add(value);
          break;
      }
    }
  }

  @override
  RewardsMeResponse deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = RewardsMeResponseBuilder();
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

class RewardsMeResponseSubscriptionTierEnum extends EnumClass {

  @BuiltValueEnumConst(wireName: r'guest')
  static const RewardsMeResponseSubscriptionTierEnum guest = _$rewardsMeResponseSubscriptionTierEnum_guest;
  @BuiltValueEnumConst(wireName: r'free')
  static const RewardsMeResponseSubscriptionTierEnum free = _$rewardsMeResponseSubscriptionTierEnum_free;
  @BuiltValueEnumConst(wireName: r'premium')
  static const RewardsMeResponseSubscriptionTierEnum premium = _$rewardsMeResponseSubscriptionTierEnum_premium;
  @BuiltValueEnumConst(wireName: r'black')
  static const RewardsMeResponseSubscriptionTierEnum black = _$rewardsMeResponseSubscriptionTierEnum_black;
  @BuiltValueEnumConst(wireName: r'editorial')
  static const RewardsMeResponseSubscriptionTierEnum editorial = _$rewardsMeResponseSubscriptionTierEnum_editorial;

  static Serializer<RewardsMeResponseSubscriptionTierEnum> get serializer => _$rewardsMeResponseSubscriptionTierEnumSerializer;

  const RewardsMeResponseSubscriptionTierEnum._(String name): super(name);

  static BuiltSet<RewardsMeResponseSubscriptionTierEnum> get values => _$rewardsMeResponseSubscriptionTierEnumValues;
  static RewardsMeResponseSubscriptionTierEnum valueOf(String name) => _$rewardsMeResponseSubscriptionTierEnumValueOf(name);
}

class RewardsMeResponseRedemptionStatusEnum extends EnumClass {

  @BuiltValueEnumConst(wireName: r'active')
  static const RewardsMeResponseRedemptionStatusEnum active = _$rewardsMeResponseRedemptionStatusEnum_active;
  @BuiltValueEnumConst(wireName: r'restricted')
  static const RewardsMeResponseRedemptionStatusEnum restricted = _$rewardsMeResponseRedemptionStatusEnum_restricted;

  static Serializer<RewardsMeResponseRedemptionStatusEnum> get serializer => _$rewardsMeResponseRedemptionStatusEnumSerializer;

  const RewardsMeResponseRedemptionStatusEnum._(String name): super(name);

  static BuiltSet<RewardsMeResponseRedemptionStatusEnum> get values => _$rewardsMeResponseRedemptionStatusEnumValues;
  static RewardsMeResponseRedemptionStatusEnum valueOf(String name) => _$rewardsMeResponseRedemptionStatusEnumValueOf(name);
}
