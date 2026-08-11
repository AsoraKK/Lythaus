//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:lythaus_api_client/src/model/refresh_token_request.dart';
import 'package:lythaus_api_client/src/model/legacy_refresh_token_request.dart';
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';
import 'package:one_of/one_of.dart';

part 'refresh_session_request.g.dart';

/// RefreshSessionRequest
///
/// Properties:
/// * [refreshToken]
/// * [refreshToken]
@BuiltValue()
abstract class RefreshSessionRequest implements Built<RefreshSessionRequest, RefreshSessionRequestBuilder> {
  /// One Of [LegacyRefreshTokenRequest], [RefreshTokenRequest]
  OneOf get oneOf;

  RefreshSessionRequest._();

  factory RefreshSessionRequest([void updates(RefreshSessionRequestBuilder b)]) = _$RefreshSessionRequest;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(RefreshSessionRequestBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<RefreshSessionRequest> get serializer => _$RefreshSessionRequestSerializer();
}

class _$RefreshSessionRequestSerializer implements PrimitiveSerializer<RefreshSessionRequest> {
  @override
  final Iterable<Type> types = const [RefreshSessionRequest, _$RefreshSessionRequest];

  @override
  final String wireName = r'RefreshSessionRequest';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    RefreshSessionRequest object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
  }

  @override
  Object serialize(
    Serializers serializers,
    RefreshSessionRequest object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final oneOf = object.oneOf;
    return serializers.serialize(oneOf.value, specifiedType: FullType(oneOf.valueType))!;
  }

  @override
  RefreshSessionRequest deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = RefreshSessionRequestBuilder();
    Object? oneOfDataSrc;
    final targetType = const FullType(OneOf, [FullType(RefreshTokenRequest), FullType(LegacyRefreshTokenRequest), ]);
    oneOfDataSrc = serialized;
    result.oneOf = serializers.deserialize(oneOfDataSrc, specifiedType: targetType) as OneOf;
    return result.build();
  }
}
