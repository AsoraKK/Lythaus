//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:built_collection/built_collection.dart';
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'auth_password_reset_complete200_response.g.dart';

/// AuthPasswordResetComplete200Response
///
/// Properties:
/// * [state]
@BuiltValue()
abstract class AuthPasswordResetComplete200Response implements Built<AuthPasswordResetComplete200Response, AuthPasswordResetComplete200ResponseBuilder> {
  @BuiltValueField(wireName: r'state')
  AuthPasswordResetComplete200ResponseStateEnum get state;
  // enum stateEnum {  password_reset_completed,  };

  AuthPasswordResetComplete200Response._();

  factory AuthPasswordResetComplete200Response([void updates(AuthPasswordResetComplete200ResponseBuilder b)]) = _$AuthPasswordResetComplete200Response;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(AuthPasswordResetComplete200ResponseBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<AuthPasswordResetComplete200Response> get serializer => _$AuthPasswordResetComplete200ResponseSerializer();
}

class _$AuthPasswordResetComplete200ResponseSerializer implements PrimitiveSerializer<AuthPasswordResetComplete200Response> {
  @override
  final Iterable<Type> types = const [AuthPasswordResetComplete200Response, _$AuthPasswordResetComplete200Response];

  @override
  final String wireName = r'AuthPasswordResetComplete200Response';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    AuthPasswordResetComplete200Response object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    yield r'state';
    yield serializers.serialize(
      object.state,
      specifiedType: const FullType(AuthPasswordResetComplete200ResponseStateEnum),
    );
  }

  @override
  Object serialize(
    Serializers serializers,
    AuthPasswordResetComplete200Response object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required AuthPasswordResetComplete200ResponseBuilder result,
    required List<Object?> unhandled,
  }) {
    for (var i = 0; i < serializedList.length; i += 2) {
      final key = serializedList[i] as String;
      final value = serializedList[i + 1];
      switch (key) {
        case r'state':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(AuthPasswordResetComplete200ResponseStateEnum),
          ) as AuthPasswordResetComplete200ResponseStateEnum;
          result.state = valueDes;
          break;
        default:
          unhandled.add(key);
          unhandled.add(value);
          break;
      }
    }
  }

  @override
  AuthPasswordResetComplete200Response deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = AuthPasswordResetComplete200ResponseBuilder();
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

class AuthPasswordResetComplete200ResponseStateEnum extends EnumClass {

  @BuiltValueEnumConst(wireName: r'password_reset_completed')
  static const AuthPasswordResetComplete200ResponseStateEnum passwordResetCompleted = _$authPasswordResetComplete200ResponseStateEnum_passwordResetCompleted;

  static Serializer<AuthPasswordResetComplete200ResponseStateEnum> get serializer => _$authPasswordResetComplete200ResponseStateEnumSerializer;

  const AuthPasswordResetComplete200ResponseStateEnum._(String name): super(name);

  static BuiltSet<AuthPasswordResetComplete200ResponseStateEnum> get values => _$authPasswordResetComplete200ResponseStateEnumValues;
  static AuthPasswordResetComplete200ResponseStateEnum valueOf(String name) => _$authPasswordResetComplete200ResponseStateEnumValueOf(name);
}
