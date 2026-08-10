//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:built_collection/built_collection.dart';
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'product_integrity_profile_update_request.g.dart';

/// ProductIntegrityProfileUpdateRequest
///
/// Properties:
/// * [displayName]
/// * [bio]
/// * [trustPassportVisibility]
/// * [accountabilityName] - Private encrypted accountability name. It is never returned by profile or activity APIs.
@BuiltValue()
abstract class ProductIntegrityProfileUpdateRequest implements Built<ProductIntegrityProfileUpdateRequest, ProductIntegrityProfileUpdateRequestBuilder> {
  @BuiltValueField(wireName: r'displayName')
  String? get displayName;

  @BuiltValueField(wireName: r'bio')
  String? get bio;

  @BuiltValueField(wireName: r'trustPassportVisibility')
  ProductIntegrityProfileUpdateRequestTrustPassportVisibilityEnum? get trustPassportVisibility;
  // enum trustPassportVisibilityEnum {  public_expanded,  public_minimal,  private,  };

  /// Private encrypted accountability name. It is never returned by profile or activity APIs.
  @BuiltValueField(wireName: r'accountabilityName')
  String? get accountabilityName;

  ProductIntegrityProfileUpdateRequest._();

  factory ProductIntegrityProfileUpdateRequest([void updates(ProductIntegrityProfileUpdateRequestBuilder b)]) = _$ProductIntegrityProfileUpdateRequest;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(ProductIntegrityProfileUpdateRequestBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<ProductIntegrityProfileUpdateRequest> get serializer => _$ProductIntegrityProfileUpdateRequestSerializer();
}

class _$ProductIntegrityProfileUpdateRequestSerializer implements PrimitiveSerializer<ProductIntegrityProfileUpdateRequest> {
  @override
  final Iterable<Type> types = const [ProductIntegrityProfileUpdateRequest, _$ProductIntegrityProfileUpdateRequest];

  @override
  final String wireName = r'ProductIntegrityProfileUpdateRequest';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    ProductIntegrityProfileUpdateRequest object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    if (object.displayName != null) {
      yield r'displayName';
      yield serializers.serialize(
        object.displayName,
        specifiedType: const FullType(String),
      );
    }
    if (object.bio != null) {
      yield r'bio';
      yield serializers.serialize(
        object.bio,
        specifiedType: const FullType(String),
      );
    }
    if (object.trustPassportVisibility != null) {
      yield r'trustPassportVisibility';
      yield serializers.serialize(
        object.trustPassportVisibility,
        specifiedType: const FullType(ProductIntegrityProfileUpdateRequestTrustPassportVisibilityEnum),
      );
    }
    if (object.accountabilityName != null) {
      yield r'accountabilityName';
      yield serializers.serialize(
        object.accountabilityName,
        specifiedType: const FullType.nullable(String),
      );
    }
  }

  @override
  Object serialize(
    Serializers serializers,
    ProductIntegrityProfileUpdateRequest object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required ProductIntegrityProfileUpdateRequestBuilder result,
    required List<Object?> unhandled,
  }) {
    for (var i = 0; i < serializedList.length; i += 2) {
      final key = serializedList[i] as String;
      final value = serializedList[i + 1];
      switch (key) {
        case r'displayName':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.displayName = valueDes;
          break;
        case r'bio':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.bio = valueDes;
          break;
        case r'trustPassportVisibility':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(ProductIntegrityProfileUpdateRequestTrustPassportVisibilityEnum),
          ) as ProductIntegrityProfileUpdateRequestTrustPassportVisibilityEnum;
          result.trustPassportVisibility = valueDes;
          break;
        case r'accountabilityName':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType.nullable(String),
          ) as String?;
          if (valueDes == null) continue;
          result.accountabilityName = valueDes;
          break;
        default:
          unhandled.add(key);
          unhandled.add(value);
          break;
      }
    }
  }

  @override
  ProductIntegrityProfileUpdateRequest deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = ProductIntegrityProfileUpdateRequestBuilder();
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

class ProductIntegrityProfileUpdateRequestTrustPassportVisibilityEnum extends EnumClass {

  @BuiltValueEnumConst(wireName: r'public_expanded')
  static const ProductIntegrityProfileUpdateRequestTrustPassportVisibilityEnum publicExpanded = _$productIntegrityProfileUpdateRequestTrustPassportVisibilityEnum_publicExpanded;
  @BuiltValueEnumConst(wireName: r'public_minimal')
  static const ProductIntegrityProfileUpdateRequestTrustPassportVisibilityEnum publicMinimal = _$productIntegrityProfileUpdateRequestTrustPassportVisibilityEnum_publicMinimal;
  @BuiltValueEnumConst(wireName: r'private')
  static const ProductIntegrityProfileUpdateRequestTrustPassportVisibilityEnum private = _$productIntegrityProfileUpdateRequestTrustPassportVisibilityEnum_private;

  static Serializer<ProductIntegrityProfileUpdateRequestTrustPassportVisibilityEnum> get serializer => _$productIntegrityProfileUpdateRequestTrustPassportVisibilityEnumSerializer;

  const ProductIntegrityProfileUpdateRequestTrustPassportVisibilityEnum._(String name): super(name);

  static BuiltSet<ProductIntegrityProfileUpdateRequestTrustPassportVisibilityEnum> get values => _$productIntegrityProfileUpdateRequestTrustPassportVisibilityEnumValues;
  static ProductIntegrityProfileUpdateRequestTrustPassportVisibilityEnum valueOf(String name) => _$productIntegrityProfileUpdateRequestTrustPassportVisibilityEnumValueOf(name);
}
