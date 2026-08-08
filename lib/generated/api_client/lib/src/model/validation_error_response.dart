//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:lythaus_api_client/src/model/validation_error_response_error.dart';
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'validation_error_response.g.dart';

/// 400 response with structured field-level validation failures.
///
/// Properties:
/// * [error]
@BuiltValue()
abstract class ValidationErrorResponse implements Built<ValidationErrorResponse, ValidationErrorResponseBuilder> {
  @BuiltValueField(wireName: r'error')
  ValidationErrorResponseError get error;

  ValidationErrorResponse._();

  factory ValidationErrorResponse([void updates(ValidationErrorResponseBuilder b)]) = _$ValidationErrorResponse;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(ValidationErrorResponseBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<ValidationErrorResponse> get serializer => _$ValidationErrorResponseSerializer();
}

class _$ValidationErrorResponseSerializer implements PrimitiveSerializer<ValidationErrorResponse> {
  @override
  final Iterable<Type> types = const [ValidationErrorResponse, _$ValidationErrorResponse];

  @override
  final String wireName = r'ValidationErrorResponse';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    ValidationErrorResponse object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    yield r'error';
    yield serializers.serialize(
      object.error,
      specifiedType: const FullType(ValidationErrorResponseError),
    );
  }

  @override
  Object serialize(
    Serializers serializers,
    ValidationErrorResponse object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required ValidationErrorResponseBuilder result,
    required List<Object?> unhandled,
  }) {
    for (var i = 0; i < serializedList.length; i += 2) {
      final key = serializedList[i] as String;
      final value = serializedList[i + 1];
      switch (key) {
        case r'error':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(ValidationErrorResponseError),
          ) as ValidationErrorResponseError;
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
  ValidationErrorResponse deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = ValidationErrorResponseBuilder();
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
