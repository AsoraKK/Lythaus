//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'users_me_region_update200_response.g.dart';

/// UsersMeRegionUpdate200Response
///
/// Properties:
/// * [updated]
@BuiltValue()
abstract class UsersMeRegionUpdate200Response implements Built<UsersMeRegionUpdate200Response, UsersMeRegionUpdate200ResponseBuilder> {
  @BuiltValueField(wireName: r'updated')
  bool get updated;

  UsersMeRegionUpdate200Response._();

  factory UsersMeRegionUpdate200Response([void updates(UsersMeRegionUpdate200ResponseBuilder b)]) = _$UsersMeRegionUpdate200Response;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(UsersMeRegionUpdate200ResponseBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<UsersMeRegionUpdate200Response> get serializer => _$UsersMeRegionUpdate200ResponseSerializer();
}

class _$UsersMeRegionUpdate200ResponseSerializer implements PrimitiveSerializer<UsersMeRegionUpdate200Response> {
  @override
  final Iterable<Type> types = const [UsersMeRegionUpdate200Response, _$UsersMeRegionUpdate200Response];

  @override
  final String wireName = r'UsersMeRegionUpdate200Response';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    UsersMeRegionUpdate200Response object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    yield r'updated';
    yield serializers.serialize(
      object.updated,
      specifiedType: const FullType(bool),
    );
  }

  @override
  Object serialize(
    Serializers serializers,
    UsersMeRegionUpdate200Response object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required UsersMeRegionUpdate200ResponseBuilder result,
    required List<Object?> unhandled,
  }) {
    for (var i = 0; i < serializedList.length; i += 2) {
      final key = serializedList[i] as String;
      final value = serializedList[i + 1];
      switch (key) {
        case r'updated':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(bool),
          ) as bool;
          result.updated = valueDes;
          break;
        default:
          unhandled.add(key);
          unhandled.add(value);
          break;
      }
    }
  }

  @override
  UsersMeRegionUpdate200Response deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = UsersMeRegionUpdate200ResponseBuilder();
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
