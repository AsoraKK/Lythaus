//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'auth_password_reset_request_request.g.dart';

/// AuthPasswordResetRequestRequest
///
/// Properties:
/// * [email]
/// * [turnstileToken]
@BuiltValue()
abstract class AuthPasswordResetRequestRequest implements Built<AuthPasswordResetRequestRequest, AuthPasswordResetRequestRequestBuilder> {
  @BuiltValueField(wireName: r'email')
  String get email;

  @BuiltValueField(wireName: r'turnstileToken')
  String get turnstileToken;

  AuthPasswordResetRequestRequest._();

  factory AuthPasswordResetRequestRequest([void updates(AuthPasswordResetRequestRequestBuilder b)]) = _$AuthPasswordResetRequestRequest;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(AuthPasswordResetRequestRequestBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<AuthPasswordResetRequestRequest> get serializer => _$AuthPasswordResetRequestRequestSerializer();
}

class _$AuthPasswordResetRequestRequestSerializer implements PrimitiveSerializer<AuthPasswordResetRequestRequest> {
  @override
  final Iterable<Type> types = const [AuthPasswordResetRequestRequest, _$AuthPasswordResetRequestRequest];

  @override
  final String wireName = r'AuthPasswordResetRequestRequest';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    AuthPasswordResetRequestRequest object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    yield r'email';
    yield serializers.serialize(
      object.email,
      specifiedType: const FullType(String),
    );
    yield r'turnstileToken';
    yield serializers.serialize(
      object.turnstileToken,
      specifiedType: const FullType(String),
    );
  }

  @override
  Object serialize(
    Serializers serializers,
    AuthPasswordResetRequestRequest object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required AuthPasswordResetRequestRequestBuilder result,
    required List<Object?> unhandled,
  }) {
    for (var i = 0; i < serializedList.length; i += 2) {
      final key = serializedList[i] as String;
      final value = serializedList[i + 1];
      switch (key) {
        case r'email':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.email = valueDes;
          break;
        case r'turnstileToken':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.turnstileToken = valueDes;
          break;
        default:
          unhandled.add(key);
          unhandled.add(value);
          break;
      }
    }
  }

  @override
  AuthPasswordResetRequestRequest deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = AuthPasswordResetRequestRequestBuilder();
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
