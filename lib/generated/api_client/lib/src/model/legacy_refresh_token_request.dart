//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'legacy_refresh_token_request.g.dart';

/// LegacyRefreshTokenRequest
///
/// Properties:
/// * [refreshToken]
@Deprecated('LegacyRefreshTokenRequest has been deprecated')
@BuiltValue()
abstract class LegacyRefreshTokenRequest implements Built<LegacyRefreshTokenRequest, LegacyRefreshTokenRequestBuilder> {
  @BuiltValueField(wireName: r'refresh_token')
  String get refreshToken;

  LegacyRefreshTokenRequest._();

  factory LegacyRefreshTokenRequest([void updates(LegacyRefreshTokenRequestBuilder b)]) = _$LegacyRefreshTokenRequest;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(LegacyRefreshTokenRequestBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<LegacyRefreshTokenRequest> get serializer => _$LegacyRefreshTokenRequestSerializer();
}

class _$LegacyRefreshTokenRequestSerializer implements PrimitiveSerializer<LegacyRefreshTokenRequest> {
  @override
  final Iterable<Type> types = const [LegacyRefreshTokenRequest, _$LegacyRefreshTokenRequest];

  @override
  final String wireName = r'LegacyRefreshTokenRequest';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    LegacyRefreshTokenRequest object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    yield r'refresh_token';
    yield serializers.serialize(
      object.refreshToken,
      specifiedType: const FullType(String),
    );
  }

  @override
  Object serialize(
    Serializers serializers,
    LegacyRefreshTokenRequest object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required LegacyRefreshTokenRequestBuilder result,
    required List<Object?> unhandled,
  }) {
    for (var i = 0; i < serializedList.length; i += 2) {
      final key = serializedList[i] as String;
      final value = serializedList[i + 1];
      switch (key) {
        case r'refresh_token':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.refreshToken = valueDes;
          break;
        default:
          unhandled.add(key);
          unhandled.add(value);
          break;
      }
    }
  }

  @override
  LegacyRefreshTokenRequest deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = LegacyRefreshTokenRequestBuilder();
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
