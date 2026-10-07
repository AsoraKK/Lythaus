//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:lythaus_api_client/src/model/product_integrity_public_profile_user.dart';
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'product_integrity_public_profile_response.g.dart';

/// ProductIntegrityPublicProfileResponse
///
/// Properties:
/// * [user]
@BuiltValue()
abstract class ProductIntegrityPublicProfileResponse implements Built<ProductIntegrityPublicProfileResponse, ProductIntegrityPublicProfileResponseBuilder> {
  @BuiltValueField(wireName: r'user')
  ProductIntegrityPublicProfileUser get user;

  ProductIntegrityPublicProfileResponse._();

  factory ProductIntegrityPublicProfileResponse([void updates(ProductIntegrityPublicProfileResponseBuilder b)]) = _$ProductIntegrityPublicProfileResponse;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(ProductIntegrityPublicProfileResponseBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<ProductIntegrityPublicProfileResponse> get serializer => _$ProductIntegrityPublicProfileResponseSerializer();
}

class _$ProductIntegrityPublicProfileResponseSerializer implements PrimitiveSerializer<ProductIntegrityPublicProfileResponse> {
  @override
  final Iterable<Type> types = const [ProductIntegrityPublicProfileResponse, _$ProductIntegrityPublicProfileResponse];

  @override
  final String wireName = r'ProductIntegrityPublicProfileResponse';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    ProductIntegrityPublicProfileResponse object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    yield r'user';
    yield serializers.serialize(
      object.user,
      specifiedType: const FullType(ProductIntegrityPublicProfileUser),
    );
  }

  @override
  Object serialize(
    Serializers serializers,
    ProductIntegrityPublicProfileResponse object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required ProductIntegrityPublicProfileResponseBuilder result,
    required List<Object?> unhandled,
  }) {
    for (var i = 0; i < serializedList.length; i += 2) {
      final key = serializedList[i] as String;
      final value = serializedList[i + 1];
      switch (key) {
        case r'user':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(ProductIntegrityPublicProfileUser),
          ) as ProductIntegrityPublicProfileUser;
          result.user.replace(valueDes);
          break;
        default:
          unhandled.add(key);
          unhandled.add(value);
          break;
      }
    }
  }

  @override
  ProductIntegrityPublicProfileResponse deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = ProductIntegrityPublicProfileResponseBuilder();
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
