//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:lythaus_api_client/src/model/subscription_status_entitlements.dart';
import 'package:built_collection/built_collection.dart';
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'subscription_status.g.dart';

/// The exact entitlement-only response emitted by GET /api/subscription/status. Legacy or unknown extra keys are not modeled and must be ignored; they do not establish provider, pending, payment-confirmed, cancellation, or expiry state. A future provider lifecycle requires a separately approved contract.
///
/// Properties:
/// * [tier] - Current server-recorded tier. Unknown stored values resolve to free.
/// * [entitlements]
@BuiltValue()
abstract class SubscriptionStatus implements Built<SubscriptionStatus, SubscriptionStatusBuilder> {
  /// Current server-recorded tier. Unknown stored values resolve to free.
  @BuiltValueField(wireName: r'tier')
  SubscriptionStatusTierEnum get tier;
  // enum tierEnum {  free,  premium,  black,  };

  @BuiltValueField(wireName: r'entitlements')
  SubscriptionStatusEntitlements get entitlements;

  SubscriptionStatus._();

  factory SubscriptionStatus([void updates(SubscriptionStatusBuilder b)]) = _$SubscriptionStatus;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(SubscriptionStatusBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<SubscriptionStatus> get serializer => _$SubscriptionStatusSerializer();
}

class _$SubscriptionStatusSerializer implements PrimitiveSerializer<SubscriptionStatus> {
  @override
  final Iterable<Type> types = const [SubscriptionStatus, _$SubscriptionStatus];

  @override
  final String wireName = r'SubscriptionStatus';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    SubscriptionStatus object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    yield r'tier';
    yield serializers.serialize(
      object.tier,
      specifiedType: const FullType(SubscriptionStatusTierEnum),
    );
    yield r'entitlements';
    yield serializers.serialize(
      object.entitlements,
      specifiedType: const FullType(SubscriptionStatusEntitlements),
    );
  }

  @override
  Object serialize(
    Serializers serializers,
    SubscriptionStatus object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required SubscriptionStatusBuilder result,
    required List<Object?> unhandled,
  }) {
    for (var i = 0; i < serializedList.length; i += 2) {
      final key = serializedList[i] as String;
      final value = serializedList[i + 1];
      switch (key) {
        case r'tier':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(SubscriptionStatusTierEnum),
          ) as SubscriptionStatusTierEnum;
          result.tier = valueDes;
          break;
        case r'entitlements':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(SubscriptionStatusEntitlements),
          ) as SubscriptionStatusEntitlements;
          result.entitlements.replace(valueDes);
          break;
        default:
          unhandled.add(key);
          unhandled.add(value);
          break;
      }
    }
  }

  @override
  SubscriptionStatus deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = SubscriptionStatusBuilder();
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

class SubscriptionStatusTierEnum extends EnumClass {

  /// Current server-recorded tier. Unknown stored values resolve to free.
  @BuiltValueEnumConst(wireName: r'free')
  static const SubscriptionStatusTierEnum free = _$subscriptionStatusTierEnum_free;
  /// Current server-recorded tier. Unknown stored values resolve to free.
  @BuiltValueEnumConst(wireName: r'premium')
  static const SubscriptionStatusTierEnum premium = _$subscriptionStatusTierEnum_premium;
  /// Current server-recorded tier. Unknown stored values resolve to free.
  @BuiltValueEnumConst(wireName: r'black')
  static const SubscriptionStatusTierEnum black = _$subscriptionStatusTierEnum_black;

  static Serializer<SubscriptionStatusTierEnum> get serializer => _$subscriptionStatusTierEnumSerializer;

  const SubscriptionStatusTierEnum._(String name): super(name);

  static BuiltSet<SubscriptionStatusTierEnum> get values => _$subscriptionStatusTierEnumValues;
  static SubscriptionStatusTierEnum valueOf(String name) => _$subscriptionStatusTierEnumValueOf(name);
}
