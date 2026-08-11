//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:built_collection/built_collection.dart';
import 'package:built_value/json_object.dart';
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'auth_jwks_get200_response.g.dart';

/// AuthJwksGet200Response
///
/// Properties:
/// * [keys]
@BuiltValue()
abstract class AuthJwksGet200Response implements Built<AuthJwksGet200Response, AuthJwksGet200ResponseBuilder> {
  @BuiltValueField(wireName: r'keys')
  BuiltList<BuiltMap<String, JsonObject?>> get keys;

  AuthJwksGet200Response._();

  factory AuthJwksGet200Response([void updates(AuthJwksGet200ResponseBuilder b)]) = _$AuthJwksGet200Response;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(AuthJwksGet200ResponseBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<AuthJwksGet200Response> get serializer => _$AuthJwksGet200ResponseSerializer();
}

class _$AuthJwksGet200ResponseSerializer implements PrimitiveSerializer<AuthJwksGet200Response> {
  @override
  final Iterable<Type> types = const [AuthJwksGet200Response, _$AuthJwksGet200Response];

  @override
  final String wireName = r'AuthJwksGet200Response';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    AuthJwksGet200Response object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    yield r'keys';
    yield serializers.serialize(
      object.keys,
      specifiedType: const FullType(BuiltList, [FullType(BuiltMap, [FullType(String), FullType.nullable(JsonObject)])]),
    );
  }

  @override
  Object serialize(
    Serializers serializers,
    AuthJwksGet200Response object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required AuthJwksGet200ResponseBuilder result,
    required List<Object?> unhandled,
  }) {
    for (var i = 0; i < serializedList.length; i += 2) {
      final key = serializedList[i] as String;
      final value = serializedList[i + 1];
      switch (key) {
        case r'keys':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(BuiltList, [FullType(BuiltMap, [FullType(String), FullType.nullable(JsonObject)])]),
          ) as BuiltList<BuiltMap<String, JsonObject?>>;
          result.keys.replace(valueDes);
          break;
        default:
          unhandled.add(key);
          unhandled.add(value);
          break;
      }
    }
  }

  @override
  AuthJwksGet200Response deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = AuthJwksGet200ResponseBuilder();
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
