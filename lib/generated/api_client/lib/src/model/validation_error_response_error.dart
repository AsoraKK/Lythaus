//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:built_collection/built_collection.dart';
import 'package:lythaus_api_client/src/model/validation_error_response_error_fields_inner.dart';
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'validation_error_response_error.g.dart';

/// ValidationErrorResponseError
///
/// Properties:
/// * [code]
/// * [message]
/// * [correlationId]
/// * [fields] - Per-field validation errors
@BuiltValue()
abstract class ValidationErrorResponseError implements Built<ValidationErrorResponseError, ValidationErrorResponseErrorBuilder> {
  @BuiltValueField(wireName: r'code')
  String get code;

  @BuiltValueField(wireName: r'message')
  String get message;

  @BuiltValueField(wireName: r'correlationId')
  String? get correlationId;

  /// Per-field validation errors
  @BuiltValueField(wireName: r'fields')
  BuiltList<ValidationErrorResponseErrorFieldsInner>? get fields;

  ValidationErrorResponseError._();

  factory ValidationErrorResponseError([void updates(ValidationErrorResponseErrorBuilder b)]) = _$ValidationErrorResponseError;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(ValidationErrorResponseErrorBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<ValidationErrorResponseError> get serializer => _$ValidationErrorResponseErrorSerializer();
}

class _$ValidationErrorResponseErrorSerializer implements PrimitiveSerializer<ValidationErrorResponseError> {
  @override
  final Iterable<Type> types = const [ValidationErrorResponseError, _$ValidationErrorResponseError];

  @override
  final String wireName = r'ValidationErrorResponseError';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    ValidationErrorResponseError object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    yield r'code';
    yield serializers.serialize(
      object.code,
      specifiedType: const FullType(String),
    );
    yield r'message';
    yield serializers.serialize(
      object.message,
      specifiedType: const FullType(String),
    );
    if (object.correlationId != null) {
      yield r'correlationId';
      yield serializers.serialize(
        object.correlationId,
        specifiedType: const FullType(String),
      );
    }
    if (object.fields != null) {
      yield r'fields';
      yield serializers.serialize(
        object.fields,
        specifiedType: const FullType(BuiltList, [FullType(ValidationErrorResponseErrorFieldsInner)]),
      );
    }
  }

  @override
  Object serialize(
    Serializers serializers,
    ValidationErrorResponseError object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required ValidationErrorResponseErrorBuilder result,
    required List<Object?> unhandled,
  }) {
    for (var i = 0; i < serializedList.length; i += 2) {
      final key = serializedList[i] as String;
      final value = serializedList[i + 1];
      switch (key) {
        case r'code':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.code = valueDes;
          break;
        case r'message':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.message = valueDes;
          break;
        case r'correlationId':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.correlationId = valueDes;
          break;
        case r'fields':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(BuiltList, [FullType(ValidationErrorResponseErrorFieldsInner)]),
          ) as BuiltList<ValidationErrorResponseErrorFieldsInner>;
          result.fields.replace(valueDes);
          break;
        default:
          unhandled.add(key);
          unhandled.add(value);
          break;
      }
    }
  }

  @override
  ValidationErrorResponseError deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = ValidationErrorResponseErrorBuilder();
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
