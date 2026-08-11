//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:built_collection/built_collection.dart';
import 'package:built_value/json_object.dart';
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'product_integrity_private_profile_user.g.dart';

/// ProductIntegrityPrivateProfileUser
///
/// Properties:
/// * [id]
/// * [displayName]
/// * [handle]
/// * [avatarUrl]
/// * [bio]
/// * [trustPassportVisibility]
/// * [reputationLevel]
/// * [reputation]
/// * [journalistVerified]
/// * [badges]
/// * [subscriptionTier]
/// * [accountabilityIdentityDeclared] - Whether a private accountability name is stored. This is not a verification claim and never discloses the name.
@BuiltValue()
abstract class ProductIntegrityPrivateProfileUser implements Built<ProductIntegrityPrivateProfileUser, ProductIntegrityPrivateProfileUserBuilder> {
  @BuiltValueField(wireName: r'id')
  String get id;

  @BuiltValueField(wireName: r'displayName')
  String get displayName;

  @BuiltValueField(wireName: r'handle')
  String? get handle;

  @BuiltValueField(wireName: r'avatarUrl')
  String? get avatarUrl;

  @BuiltValueField(wireName: r'bio')
  String? get bio;

  @BuiltValueField(wireName: r'trustPassportVisibility')
  ProductIntegrityPrivateProfileUserTrustPassportVisibilityEnum get trustPassportVisibility;
  // enum trustPassportVisibilityEnum {  public_expanded,  public_minimal,  private,  };

  @BuiltValueField(wireName: r'reputationLevel')
  int get reputationLevel;

  @BuiltValueField(wireName: r'reputation')
  BuiltMap<String, JsonObject?>? get reputation;

  @BuiltValueField(wireName: r'journalistVerified')
  bool? get journalistVerified;

  @BuiltValueField(wireName: r'badges')
  BuiltList<BuiltMap<String, JsonObject?>>? get badges;

  @BuiltValueField(wireName: r'subscriptionTier')
  ProductIntegrityPrivateProfileUserSubscriptionTierEnum get subscriptionTier;
  // enum subscriptionTierEnum {  free,  premium,  black,  };

  /// Whether a private accountability name is stored. This is not a verification claim and never discloses the name.
  @BuiltValueField(wireName: r'accountabilityIdentityDeclared')
  bool get accountabilityIdentityDeclared;

  ProductIntegrityPrivateProfileUser._();

  factory ProductIntegrityPrivateProfileUser([void updates(ProductIntegrityPrivateProfileUserBuilder b)]) = _$ProductIntegrityPrivateProfileUser;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(ProductIntegrityPrivateProfileUserBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<ProductIntegrityPrivateProfileUser> get serializer => _$ProductIntegrityPrivateProfileUserSerializer();
}

class _$ProductIntegrityPrivateProfileUserSerializer implements PrimitiveSerializer<ProductIntegrityPrivateProfileUser> {
  @override
  final Iterable<Type> types = const [ProductIntegrityPrivateProfileUser, _$ProductIntegrityPrivateProfileUser];

  @override
  final String wireName = r'ProductIntegrityPrivateProfileUser';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    ProductIntegrityPrivateProfileUser object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    yield r'id';
    yield serializers.serialize(
      object.id,
      specifiedType: const FullType(String),
    );
    yield r'displayName';
    yield serializers.serialize(
      object.displayName,
      specifiedType: const FullType(String),
    );
    if (object.handle != null) {
      yield r'handle';
      yield serializers.serialize(
        object.handle,
        specifiedType: const FullType.nullable(String),
      );
    }
    if (object.avatarUrl != null) {
      yield r'avatarUrl';
      yield serializers.serialize(
        object.avatarUrl,
        specifiedType: const FullType.nullable(String),
      );
    }
    if (object.bio != null) {
      yield r'bio';
      yield serializers.serialize(
        object.bio,
        specifiedType: const FullType.nullable(String),
      );
    }
    yield r'trustPassportVisibility';
    yield serializers.serialize(
      object.trustPassportVisibility,
      specifiedType: const FullType(ProductIntegrityPrivateProfileUserTrustPassportVisibilityEnum),
    );
    yield r'reputationLevel';
    yield serializers.serialize(
      object.reputationLevel,
      specifiedType: const FullType(int),
    );
    if (object.reputation != null) {
      yield r'reputation';
      yield serializers.serialize(
        object.reputation,
        specifiedType: const FullType(BuiltMap, [FullType(String), FullType.nullable(JsonObject)]),
      );
    }
    if (object.journalistVerified != null) {
      yield r'journalistVerified';
      yield serializers.serialize(
        object.journalistVerified,
        specifiedType: const FullType(bool),
      );
    }
    if (object.badges != null) {
      yield r'badges';
      yield serializers.serialize(
        object.badges,
        specifiedType: const FullType(BuiltList, [FullType(BuiltMap, [FullType(String), FullType.nullable(JsonObject)])]),
      );
    }
    yield r'subscriptionTier';
    yield serializers.serialize(
      object.subscriptionTier,
      specifiedType: const FullType(ProductIntegrityPrivateProfileUserSubscriptionTierEnum),
    );
    yield r'accountabilityIdentityDeclared';
    yield serializers.serialize(
      object.accountabilityIdentityDeclared,
      specifiedType: const FullType(bool),
    );
  }

  @override
  Object serialize(
    Serializers serializers,
    ProductIntegrityPrivateProfileUser object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required ProductIntegrityPrivateProfileUserBuilder result,
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
        case r'displayName':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.displayName = valueDes;
          break;
        case r'handle':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType.nullable(String),
          ) as String?;
          if (valueDes == null) continue;
          result.handle = valueDes;
          break;
        case r'avatarUrl':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType.nullable(String),
          ) as String?;
          if (valueDes == null) continue;
          result.avatarUrl = valueDes;
          break;
        case r'bio':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType.nullable(String),
          ) as String?;
          if (valueDes == null) continue;
          result.bio = valueDes;
          break;
        case r'trustPassportVisibility':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(ProductIntegrityPrivateProfileUserTrustPassportVisibilityEnum),
          ) as ProductIntegrityPrivateProfileUserTrustPassportVisibilityEnum;
          result.trustPassportVisibility = valueDes;
          break;
        case r'reputationLevel':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(int),
          ) as int;
          result.reputationLevel = valueDes;
          break;
        case r'reputation':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(BuiltMap, [FullType(String), FullType.nullable(JsonObject)]),
          ) as BuiltMap<String, JsonObject?>;
          result.reputation.replace(valueDes);
          break;
        case r'journalistVerified':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(bool),
          ) as bool;
          result.journalistVerified = valueDes;
          break;
        case r'badges':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(BuiltList, [FullType(BuiltMap, [FullType(String), FullType.nullable(JsonObject)])]),
          ) as BuiltList<BuiltMap<String, JsonObject?>>;
          result.badges.replace(valueDes);
          break;
        case r'subscriptionTier':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(ProductIntegrityPrivateProfileUserSubscriptionTierEnum),
          ) as ProductIntegrityPrivateProfileUserSubscriptionTierEnum;
          result.subscriptionTier = valueDes;
          break;
        case r'accountabilityIdentityDeclared':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(bool),
          ) as bool;
          result.accountabilityIdentityDeclared = valueDes;
          break;
        default:
          unhandled.add(key);
          unhandled.add(value);
          break;
      }
    }
  }

  @override
  ProductIntegrityPrivateProfileUser deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = ProductIntegrityPrivateProfileUserBuilder();
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

class ProductIntegrityPrivateProfileUserTrustPassportVisibilityEnum extends EnumClass {

  @BuiltValueEnumConst(wireName: r'public_expanded')
  static const ProductIntegrityPrivateProfileUserTrustPassportVisibilityEnum publicExpanded = _$productIntegrityPrivateProfileUserTrustPassportVisibilityEnum_publicExpanded;
  @BuiltValueEnumConst(wireName: r'public_minimal')
  static const ProductIntegrityPrivateProfileUserTrustPassportVisibilityEnum publicMinimal = _$productIntegrityPrivateProfileUserTrustPassportVisibilityEnum_publicMinimal;
  @BuiltValueEnumConst(wireName: r'private')
  static const ProductIntegrityPrivateProfileUserTrustPassportVisibilityEnum private = _$productIntegrityPrivateProfileUserTrustPassportVisibilityEnum_private;

  static Serializer<ProductIntegrityPrivateProfileUserTrustPassportVisibilityEnum> get serializer => _$productIntegrityPrivateProfileUserTrustPassportVisibilityEnumSerializer;

  const ProductIntegrityPrivateProfileUserTrustPassportVisibilityEnum._(String name): super(name);

  static BuiltSet<ProductIntegrityPrivateProfileUserTrustPassportVisibilityEnum> get values => _$productIntegrityPrivateProfileUserTrustPassportVisibilityEnumValues;
  static ProductIntegrityPrivateProfileUserTrustPassportVisibilityEnum valueOf(String name) => _$productIntegrityPrivateProfileUserTrustPassportVisibilityEnumValueOf(name);
}

class ProductIntegrityPrivateProfileUserSubscriptionTierEnum extends EnumClass {

  @BuiltValueEnumConst(wireName: r'free')
  static const ProductIntegrityPrivateProfileUserSubscriptionTierEnum free = _$productIntegrityPrivateProfileUserSubscriptionTierEnum_free;
  @BuiltValueEnumConst(wireName: r'premium')
  static const ProductIntegrityPrivateProfileUserSubscriptionTierEnum premium = _$productIntegrityPrivateProfileUserSubscriptionTierEnum_premium;
  @BuiltValueEnumConst(wireName: r'black')
  static const ProductIntegrityPrivateProfileUserSubscriptionTierEnum black = _$productIntegrityPrivateProfileUserSubscriptionTierEnum_black;

  static Serializer<ProductIntegrityPrivateProfileUserSubscriptionTierEnum> get serializer => _$productIntegrityPrivateProfileUserSubscriptionTierEnumSerializer;

  const ProductIntegrityPrivateProfileUserSubscriptionTierEnum._(String name): super(name);

  static BuiltSet<ProductIntegrityPrivateProfileUserSubscriptionTierEnum> get values => _$productIntegrityPrivateProfileUserSubscriptionTierEnumValues;
  static ProductIntegrityPrivateProfileUserSubscriptionTierEnum valueOf(String name) => _$productIntegrityPrivateProfileUserSubscriptionTierEnumValueOf(name);
}
