//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:lythaus_api_client/src/model/forbidden_error_error.dart';
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'forbidden_error.g.dart';

/// 403 – authenticated caller lacks required role or permission.
///
/// Properties:
/// * [error]
@BuiltValue()
abstract class ForbiddenError implements Built<ForbiddenError, ForbiddenErrorBuilder> {
  @BuiltValueField(wireName: r'error')
  ForbiddenErrorError get error;

  ForbiddenError._();

  factory ForbiddenError([void updates(ForbiddenErrorBuilder b)]) = _$ForbiddenError;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(ForbiddenErrorBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<ForbiddenError> get serializer => _$ForbiddenErrorSerializer();
}

class _$ForbiddenErrorSerializer implements PrimitiveSerializer<ForbiddenError> {
  @override
  final Iterable<Type> types = const [ForbiddenError, _$ForbiddenError];

  @override
  final String wireName = r'ForbiddenError';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    ForbiddenError object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    yield r'error';
    yield serializers.serialize(
      object.error,
      specifiedType: const FullType(ForbiddenErrorError),
    );
  }

  @override
  Object serialize(
    Serializers serializers,
    ForbiddenError object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required ForbiddenErrorBuilder result,
    required List<Object?> unhandled,
  }) {
    for (var i = 0; i < serializedList.length; i += 2) {
      final key = serializedList[i] as String;
      final value = serializedList[i + 1];
      switch (key) {
        case r'error':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(ForbiddenErrorError),
          ) as ForbiddenErrorError;
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
  ForbiddenError deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = ForbiddenErrorBuilder();
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
