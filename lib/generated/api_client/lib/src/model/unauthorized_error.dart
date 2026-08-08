//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:lythaus_api_client/src/model/error_response_error.dart';
import 'package:lythaus_api_client/src/model/simple_error.dart';
import 'package:lythaus_api_client/src/model/error_response.dart';
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';
import 'package:one_of/one_of.dart';

part 'unauthorized_error.g.dart';

/// 401 – missing or invalid bearer token.
///
/// Properties:
/// * [error]
@BuiltValue()
abstract class UnauthorizedError implements Built<UnauthorizedError, UnauthorizedErrorBuilder> {
  /// One Of [ErrorResponse], [SimpleError]
  OneOf get oneOf;

  UnauthorizedError._();

  factory UnauthorizedError([void updates(UnauthorizedErrorBuilder b)]) = _$UnauthorizedError;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(UnauthorizedErrorBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<UnauthorizedError> get serializer => _$UnauthorizedErrorSerializer();
}

class _$UnauthorizedErrorSerializer implements PrimitiveSerializer<UnauthorizedError> {
  @override
  final Iterable<Type> types = const [UnauthorizedError, _$UnauthorizedError];

  @override
  final String wireName = r'UnauthorizedError';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    UnauthorizedError object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
  }

  @override
  Object serialize(
    Serializers serializers,
    UnauthorizedError object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final oneOf = object.oneOf;
    return serializers.serialize(oneOf.value, specifiedType: FullType(oneOf.valueType))!;
  }

  @override
  UnauthorizedError deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = UnauthorizedErrorBuilder();
    Object? oneOfDataSrc;
    final targetType = const FullType(OneOf, [FullType(SimpleError), FullType(ErrorResponse), ]);
    oneOfDataSrc = serialized;
    result.oneOf = serializers.deserialize(oneOfDataSrc, specifiedType: targetType) as OneOf;
    return result.build();
  }
}
