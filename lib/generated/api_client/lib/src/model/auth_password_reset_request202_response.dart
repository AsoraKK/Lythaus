//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:built_collection/built_collection.dart';
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'auth_password_reset_request202_response.g.dart';

/// AuthPasswordResetRequest202Response
///
/// Properties:
/// * [state]
@BuiltValue()
abstract class AuthPasswordResetRequest202Response implements Built<AuthPasswordResetRequest202Response, AuthPasswordResetRequest202ResponseBuilder> {
  @BuiltValueField(wireName: r'state')
  AuthPasswordResetRequest202ResponseStateEnum get state;
  // enum stateEnum {  reset_if_eligible,  };

  AuthPasswordResetRequest202Response._();

  factory AuthPasswordResetRequest202Response([void updates(AuthPasswordResetRequest202ResponseBuilder b)]) = _$AuthPasswordResetRequest202Response;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(AuthPasswordResetRequest202ResponseBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<AuthPasswordResetRequest202Response> get serializer => _$AuthPasswordResetRequest202ResponseSerializer();
}

class _$AuthPasswordResetRequest202ResponseSerializer implements PrimitiveSerializer<AuthPasswordResetRequest202Response> {
  @override
  final Iterable<Type> types = const [AuthPasswordResetRequest202Response, _$AuthPasswordResetRequest202Response];

  @override
  final String wireName = r'AuthPasswordResetRequest202Response';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    AuthPasswordResetRequest202Response object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    yield r'state';
    yield serializers.serialize(
      object.state,
      specifiedType: const FullType(AuthPasswordResetRequest202ResponseStateEnum),
    );
  }

  @override
  Object serialize(
    Serializers serializers,
    AuthPasswordResetRequest202Response object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required AuthPasswordResetRequest202ResponseBuilder result,
    required List<Object?> unhandled,
  }) {
    for (var i = 0; i < serializedList.length; i += 2) {
      final key = serializedList[i] as String;
      final value = serializedList[i + 1];
      switch (key) {
        case r'state':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(AuthPasswordResetRequest202ResponseStateEnum),
          ) as AuthPasswordResetRequest202ResponseStateEnum;
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
  AuthPasswordResetRequest202Response deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = AuthPasswordResetRequest202ResponseBuilder();
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

class AuthPasswordResetRequest202ResponseStateEnum extends EnumClass {

  @BuiltValueEnumConst(wireName: r'reset_if_eligible')
  static const AuthPasswordResetRequest202ResponseStateEnum resetIfEligible = _$authPasswordResetRequest202ResponseStateEnum_resetIfEligible;

  static Serializer<AuthPasswordResetRequest202ResponseStateEnum> get serializer => _$authPasswordResetRequest202ResponseStateEnumSerializer;

  const AuthPasswordResetRequest202ResponseStateEnum._(String name): super(name);

  static BuiltSet<AuthPasswordResetRequest202ResponseStateEnum> get values => _$authPasswordResetRequest202ResponseStateEnumValues;
  static AuthPasswordResetRequest202ResponseStateEnum valueOf(String name) => _$authPasswordResetRequest202ResponseStateEnumValueOf(name);
}
