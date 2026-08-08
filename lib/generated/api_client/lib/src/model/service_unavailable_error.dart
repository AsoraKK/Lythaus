//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:lythaus_api_client/src/model/service_unavailable_error_error.dart';
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'service_unavailable_error.g.dart';

/// 503 – service temporarily unavailable (dependency outage, maintenance window, or upstream timeout).
///
/// Properties:
/// * [error]
@BuiltValue()
abstract class ServiceUnavailableError implements Built<ServiceUnavailableError, ServiceUnavailableErrorBuilder> {
  @BuiltValueField(wireName: r'error')
  ServiceUnavailableErrorError get error;

  ServiceUnavailableError._();

  factory ServiceUnavailableError([void updates(ServiceUnavailableErrorBuilder b)]) = _$ServiceUnavailableError;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(ServiceUnavailableErrorBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<ServiceUnavailableError> get serializer => _$ServiceUnavailableErrorSerializer();
}

class _$ServiceUnavailableErrorSerializer implements PrimitiveSerializer<ServiceUnavailableError> {
  @override
  final Iterable<Type> types = const [ServiceUnavailableError, _$ServiceUnavailableError];

  @override
  final String wireName = r'ServiceUnavailableError';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    ServiceUnavailableError object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    yield r'error';
    yield serializers.serialize(
      object.error,
      specifiedType: const FullType(ServiceUnavailableErrorError),
    );
  }

  @override
  Object serialize(
    Serializers serializers,
    ServiceUnavailableError object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required ServiceUnavailableErrorBuilder result,
    required List<Object?> unhandled,
  }) {
    for (var i = 0; i < serializedList.length; i += 2) {
      final key = serializedList[i] as String;
      final value = serializedList[i + 1];
      switch (key) {
        case r'error':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(ServiceUnavailableErrorError),
          ) as ServiceUnavailableErrorError;
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
  ServiceUnavailableError deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = ServiceUnavailableErrorBuilder();
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
