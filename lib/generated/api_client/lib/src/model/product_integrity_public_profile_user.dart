//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:built_collection/built_collection.dart';
import 'package:lythaus_api_client/src/model/product_integrity_public_profile_user_reputation.dart';
import 'package:built_value/json_object.dart';
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'product_integrity_public_profile_user.g.dart';

/// ProductIntegrityPublicProfileUser
///
/// Properties:
/// * [id]
/// * [displayName]
/// * [handle]
/// * [avatarUrl]
/// * [bio]
/// * [trustPassportVisibility] - Persisted Passport visibility preference. Private suppresses the public reputation summary.
/// * [reputation]
/// * [journalistVerified]
/// * [badges]
@BuiltValue()
abstract class ProductIntegrityPublicProfileUser implements Built<ProductIntegrityPublicProfileUser, ProductIntegrityPublicProfileUserBuilder> {
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

  /// Persisted Passport visibility preference. Private suppresses the public reputation summary.
  @BuiltValueField(wireName: r'trustPassportVisibility')
  ProductIntegrityPublicProfileUserTrustPassportVisibilityEnum get trustPassportVisibility;
  // enum trustPassportVisibilityEnum {  public_expanded,  public_minimal,  private,  };

  @BuiltValueField(wireName: r'reputation')
  ProductIntegrityPublicProfileUserReputation? get reputation;

  @BuiltValueField(wireName: r'journalistVerified')
  bool get journalistVerified;

  @BuiltValueField(wireName: r'badges')
  BuiltList<BuiltMap<String, JsonObject?>> get badges;

  ProductIntegrityPublicProfileUser._();

  factory ProductIntegrityPublicProfileUser([void updates(ProductIntegrityPublicProfileUserBuilder b)]) = _$ProductIntegrityPublicProfileUser;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(ProductIntegrityPublicProfileUserBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<ProductIntegrityPublicProfileUser> get serializer => _$ProductIntegrityPublicProfileUserSerializer();
}

class _$ProductIntegrityPublicProfileUserSerializer implements PrimitiveSerializer<ProductIntegrityPublicProfileUser> {
  @override
  final Iterable<Type> types = const [ProductIntegrityPublicProfileUser, _$ProductIntegrityPublicProfileUser];

  @override
  final String wireName = r'ProductIntegrityPublicProfileUser';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    ProductIntegrityPublicProfileUser object, {
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
      specifiedType: const FullType(ProductIntegrityPublicProfileUserTrustPassportVisibilityEnum),
    );
    if (object.reputation != null) {
      yield r'reputation';
      yield serializers.serialize(
        object.reputation,
        specifiedType: const FullType(ProductIntegrityPublicProfileUserReputation),
      );
    }
    yield r'journalistVerified';
    yield serializers.serialize(
      object.journalistVerified,
      specifiedType: const FullType(bool),
    );
    yield r'badges';
    yield serializers.serialize(
      object.badges,
      specifiedType: const FullType(BuiltList, [FullType(BuiltMap, [FullType(String), FullType.nullable(JsonObject)])]),
    );
  }

  @override
  Object serialize(
    Serializers serializers,
    ProductIntegrityPublicProfileUser object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required ProductIntegrityPublicProfileUserBuilder result,
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
            specifiedType: const FullType(ProductIntegrityPublicProfileUserTrustPassportVisibilityEnum),
          ) as ProductIntegrityPublicProfileUserTrustPassportVisibilityEnum;
          result.trustPassportVisibility = valueDes;
          break;
        case r'reputation':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(ProductIntegrityPublicProfileUserReputation),
          ) as ProductIntegrityPublicProfileUserReputation;
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
        default:
          unhandled.add(key);
          unhandled.add(value);
          break;
      }
    }
  }

  @override
  ProductIntegrityPublicProfileUser deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = ProductIntegrityPublicProfileUserBuilder();
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

class ProductIntegrityPublicProfileUserTrustPassportVisibilityEnum extends EnumClass {

  /// Persisted Passport visibility preference. Private suppresses the public reputation summary.
  @BuiltValueEnumConst(wireName: r'public_expanded')
  static const ProductIntegrityPublicProfileUserTrustPassportVisibilityEnum publicExpanded = _$productIntegrityPublicProfileUserTrustPassportVisibilityEnum_publicExpanded;
  /// Persisted Passport visibility preference. Private suppresses the public reputation summary.
  @BuiltValueEnumConst(wireName: r'public_minimal')
  static const ProductIntegrityPublicProfileUserTrustPassportVisibilityEnum publicMinimal = _$productIntegrityPublicProfileUserTrustPassportVisibilityEnum_publicMinimal;
  /// Persisted Passport visibility preference. Private suppresses the public reputation summary.
  @BuiltValueEnumConst(wireName: r'private')
  static const ProductIntegrityPublicProfileUserTrustPassportVisibilityEnum private = _$productIntegrityPublicProfileUserTrustPassportVisibilityEnum_private;

  static Serializer<ProductIntegrityPublicProfileUserTrustPassportVisibilityEnum> get serializer => _$productIntegrityPublicProfileUserTrustPassportVisibilityEnumSerializer;

  const ProductIntegrityPublicProfileUserTrustPassportVisibilityEnum._(String name): super(name);

  static BuiltSet<ProductIntegrityPublicProfileUserTrustPassportVisibilityEnum> get values => _$productIntegrityPublicProfileUserTrustPassportVisibilityEnumValues;
  static ProductIntegrityPublicProfileUserTrustPassportVisibilityEnum valueOf(String name) => _$productIntegrityPublicProfileUserTrustPassportVisibilityEnumValueOf(name);
}
