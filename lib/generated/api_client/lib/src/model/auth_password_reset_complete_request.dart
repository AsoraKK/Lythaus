//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'auth_password_reset_complete_request.g.dart';

/// AuthPasswordResetCompleteRequest
///
/// Properties:
/// * [token]
/// * [password]
@BuiltValue()
abstract class AuthPasswordResetCompleteRequest implements Built<AuthPasswordResetCompleteRequest, AuthPasswordResetCompleteRequestBuilder> {
  @BuiltValueField(wireName: r'token')
  String get token;

  @BuiltValueField(wireName: r'password')
  String get password;

  AuthPasswordResetCompleteRequest._();

  factory AuthPasswordResetCompleteRequest([void updates(AuthPasswordResetCompleteRequestBuilder b)]) = _$AuthPasswordResetCompleteRequest;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(AuthPasswordResetCompleteRequestBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<AuthPasswordResetCompleteRequest> get serializer => _$AuthPasswordResetCompleteRequestSerializer();
}

class _$AuthPasswordResetCompleteRequestSerializer implements PrimitiveSerializer<AuthPasswordResetCompleteRequest> {
  @override
  final Iterable<Type> types = const [AuthPasswordResetCompleteRequest, _$AuthPasswordResetCompleteRequest];

  @override
  final String wireName = r'AuthPasswordResetCompleteRequest';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    AuthPasswordResetCompleteRequest object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    yield r'token';
    yield serializers.serialize(
      object.token,
      specifiedType: const FullType(String),
    );
    yield r'password';
    yield serializers.serialize(
      object.password,
      specifiedType: const FullType(String),
    );
  }

  @override
  Object serialize(
    Serializers serializers,
    AuthPasswordResetCompleteRequest object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required AuthPasswordResetCompleteRequestBuilder result,
    required List<Object?> unhandled,
  }) {
    for (var i = 0; i < serializedList.length; i += 2) {
      final key = serializedList[i] as String;
      final value = serializedList[i + 1];
      switch (key) {
        case r'token':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.token = valueDes;
          break;
        case r'password':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.password = valueDes;
          break;
        default:
          unhandled.add(key);
          unhandled.add(value);
          break;
      }
    }
  }

  @override
  AuthPasswordResetCompleteRequest deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = AuthPasswordResetCompleteRequestBuilder();
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
