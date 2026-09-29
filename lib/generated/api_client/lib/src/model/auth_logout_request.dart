//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'auth_logout_request.g.dart';

/// AuthLogoutRequest
///
/// Properties:
/// * [refreshToken]
@BuiltValue()
abstract class AuthLogoutRequest implements Built<AuthLogoutRequest, AuthLogoutRequestBuilder> {
  @BuiltValueField(wireName: r'refreshToken')
  String? get refreshToken;

  AuthLogoutRequest._();

  factory AuthLogoutRequest([void updates(AuthLogoutRequestBuilder b)]) = _$AuthLogoutRequest;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(AuthLogoutRequestBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<AuthLogoutRequest> get serializer => _$AuthLogoutRequestSerializer();
}

class _$AuthLogoutRequestSerializer implements PrimitiveSerializer<AuthLogoutRequest> {
  @override
  final Iterable<Type> types = const [AuthLogoutRequest, _$AuthLogoutRequest];

  @override
  final String wireName = r'AuthLogoutRequest';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    AuthLogoutRequest object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    if (object.refreshToken != null) {
      yield r'refreshToken';
      yield serializers.serialize(
        object.refreshToken,
        specifiedType: const FullType(String),
      );
    }
  }

  @override
  Object serialize(
    Serializers serializers,
    AuthLogoutRequest object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required AuthLogoutRequestBuilder result,
    required List<Object?> unhandled,
  }) {
    for (var i = 0; i < serializedList.length; i += 2) {
      final key = serializedList[i] as String;
      final value = serializedList[i + 1];
      switch (key) {
        case r'refreshToken':
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
  AuthLogoutRequest deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = AuthLogoutRequestBuilder();
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
