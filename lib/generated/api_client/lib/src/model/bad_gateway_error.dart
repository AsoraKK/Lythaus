//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:lythaus_api_client/src/model/bad_gateway_error_error.dart';
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'bad_gateway_error.g.dart';

/// 502 – bad gateway (upstream service returned an invalid or unexpected response).
///
/// Properties:
/// * [error]
@BuiltValue()
abstract class BadGatewayError implements Built<BadGatewayError, BadGatewayErrorBuilder> {
  @BuiltValueField(wireName: r'error')
  BadGatewayErrorError get error;

  BadGatewayError._();

  factory BadGatewayError([void updates(BadGatewayErrorBuilder b)]) = _$BadGatewayError;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(BadGatewayErrorBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<BadGatewayError> get serializer => _$BadGatewayErrorSerializer();
}

class _$BadGatewayErrorSerializer implements PrimitiveSerializer<BadGatewayError> {
  @override
  final Iterable<Type> types = const [BadGatewayError, _$BadGatewayError];

  @override
  final String wireName = r'BadGatewayError';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    BadGatewayError object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    yield r'error';
    yield serializers.serialize(
      object.error,
      specifiedType: const FullType(BadGatewayErrorError),
    );
  }

  @override
  Object serialize(
    Serializers serializers,
    BadGatewayError object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required BadGatewayErrorBuilder result,
    required List<Object?> unhandled,
  }) {
    for (var i = 0; i < serializedList.length; i += 2) {
      final key = serializedList[i] as String;
      final value = serializedList[i + 1];
      switch (key) {
        case r'error':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(BadGatewayErrorError),
          ) as BadGatewayErrorError;
          result.error.replace(valueDes);
          break;
        default:
          unhandled.add(key);
          unhandled.add(value);
          break;
      }
    }
  }

  @override
  BadGatewayError deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = BadGatewayErrorBuilder();
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
