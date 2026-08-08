//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:built_collection/built_collection.dart';
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'email_login_request.g.dart';

/// Verified email login request.
///
/// Properties:
/// * [mode]
/// * [email]
/// * [password]
@BuiltValue()
abstract class EmailLoginRequest implements Built<EmailLoginRequest, EmailLoginRequestBuilder> {
  @BuiltValueField(wireName: r'mode')
  EmailLoginRequestModeEnum get mode;
  // enum modeEnum {  login,  };

  @BuiltValueField(wireName: r'email')
  String get email;

  @BuiltValueField(wireName: r'password')
  String get password;

  EmailLoginRequest._();

  factory EmailLoginRequest([void updates(EmailLoginRequestBuilder b)]) = _$EmailLoginRequest;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(EmailLoginRequestBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<EmailLoginRequest> get serializer => _$EmailLoginRequestSerializer();
}

class _$EmailLoginRequestSerializer implements PrimitiveSerializer<EmailLoginRequest> {
  @override
  final Iterable<Type> types = const [EmailLoginRequest, _$EmailLoginRequest];

  @override
  final String wireName = r'EmailLoginRequest';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    EmailLoginRequest object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    yield r'mode';
    yield serializers.serialize(
      object.mode,
      specifiedType: const FullType(EmailLoginRequestModeEnum),
    );
    yield r'email';
    yield serializers.serialize(
      object.email,
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
    EmailLoginRequest object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required EmailLoginRequestBuilder result,
    required List<Object?> unhandled,
  }) {
    for (var i = 0; i < serializedList.length; i += 2) {
      final key = serializedList[i] as String;
      final value = serializedList[i + 1];
      switch (key) {
        case r'mode':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(EmailLoginRequestModeEnum),
          ) as EmailLoginRequestModeEnum;
          result.mode = valueDes;
          break;
        case r'email':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.email = valueDes;
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
  EmailLoginRequest deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = EmailLoginRequestBuilder();
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

class EmailLoginRequestModeEnum extends EnumClass {

  @BuiltValueEnumConst(wireName: r'login')
  static const EmailLoginRequestModeEnum login = _$emailLoginRequestModeEnum_login;

  static Serializer<EmailLoginRequestModeEnum> get serializer => _$emailLoginRequestModeEnumSerializer;

  const EmailLoginRequestModeEnum._(String name): super(name);

  static BuiltSet<EmailLoginRequestModeEnum> get values => _$emailLoginRequestModeEnumValues;
  static EmailLoginRequestModeEnum valueOf(String name) => _$emailLoginRequestModeEnumValueOf(name);
}
