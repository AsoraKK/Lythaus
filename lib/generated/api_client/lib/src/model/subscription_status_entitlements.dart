//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:built_collection/built_collection.dart';
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'subscription_status_entitlements.g.dart';

/// Feed entitlements derived from the current tier.
///
/// Properties:
/// * [maxCustomFeeds] - Maximum custom feeds available to this tier.
/// * [newsBoardAccess] - Full News Board access is available to Black accounts only; Free and Premium have none.
@BuiltValue()
abstract class SubscriptionStatusEntitlements implements Built<SubscriptionStatusEntitlements, SubscriptionStatusEntitlementsBuilder> {
  /// Maximum custom feeds available to this tier.
  @BuiltValueField(wireName: r'maxCustomFeeds')
  int get maxCustomFeeds;

  /// Full News Board access is available to Black accounts only; Free and Premium have none.
  @BuiltValueField(wireName: r'newsBoardAccess')
  SubscriptionStatusEntitlementsNewsBoardAccessEnum get newsBoardAccess;
  // enum newsBoardAccessEnum {  none,  full,  };

  SubscriptionStatusEntitlements._();

  factory SubscriptionStatusEntitlements([void updates(SubscriptionStatusEntitlementsBuilder b)]) = _$SubscriptionStatusEntitlements;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(SubscriptionStatusEntitlementsBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<SubscriptionStatusEntitlements> get serializer => _$SubscriptionStatusEntitlementsSerializer();
}

class _$SubscriptionStatusEntitlementsSerializer implements PrimitiveSerializer<SubscriptionStatusEntitlements> {
  @override
  final Iterable<Type> types = const [SubscriptionStatusEntitlements, _$SubscriptionStatusEntitlements];

  @override
  final String wireName = r'SubscriptionStatusEntitlements';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    SubscriptionStatusEntitlements object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    yield r'maxCustomFeeds';
    yield serializers.serialize(
      object.maxCustomFeeds,
      specifiedType: const FullType(int),
    );
    yield r'newsBoardAccess';
    yield serializers.serialize(
      object.newsBoardAccess,
      specifiedType: const FullType(SubscriptionStatusEntitlementsNewsBoardAccessEnum),
    );
  }

  @override
  Object serialize(
    Serializers serializers,
    SubscriptionStatusEntitlements object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required SubscriptionStatusEntitlementsBuilder result,
    required List<Object?> unhandled,
  }) {
    for (var i = 0; i < serializedList.length; i += 2) {
      final key = serializedList[i] as String;
      final value = serializedList[i + 1];
      switch (key) {
        case r'maxCustomFeeds':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(int),
          ) as int;
          result.maxCustomFeeds = valueDes;
          break;
        case r'newsBoardAccess':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(SubscriptionStatusEntitlementsNewsBoardAccessEnum),
          ) as SubscriptionStatusEntitlementsNewsBoardAccessEnum;
          result.newsBoardAccess = valueDes;
          break;
        default:
          unhandled.add(key);
          unhandled.add(value);
          break;
      }
    }
  }

  @override
  SubscriptionStatusEntitlements deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = SubscriptionStatusEntitlementsBuilder();
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

class SubscriptionStatusEntitlementsNewsBoardAccessEnum extends EnumClass {

  /// Full News Board access is available to Black accounts only; Free and Premium have none.
  @BuiltValueEnumConst(wireName: r'none')
  static const SubscriptionStatusEntitlementsNewsBoardAccessEnum none = _$subscriptionStatusEntitlementsNewsBoardAccessEnum_none;
  /// Full News Board access is available to Black accounts only; Free and Premium have none.
  @BuiltValueEnumConst(wireName: r'full')
  static const SubscriptionStatusEntitlementsNewsBoardAccessEnum full = _$subscriptionStatusEntitlementsNewsBoardAccessEnum_full;

  static Serializer<SubscriptionStatusEntitlementsNewsBoardAccessEnum> get serializer => _$subscriptionStatusEntitlementsNewsBoardAccessEnumSerializer;

  const SubscriptionStatusEntitlementsNewsBoardAccessEnum._(String name): super(name);

  static BuiltSet<SubscriptionStatusEntitlementsNewsBoardAccessEnum> get values => _$subscriptionStatusEntitlementsNewsBoardAccessEnumValues;
  static SubscriptionStatusEntitlementsNewsBoardAccessEnum valueOf(String name) => _$subscriptionStatusEntitlementsNewsBoardAccessEnumValueOf(name);
}
