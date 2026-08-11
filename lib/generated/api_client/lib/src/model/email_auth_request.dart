//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:built_collection/built_collection.dart';
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'email_auth_request.g.dart';

/// Email registration, login, or verification-resend request.
///
/// Properties:
/// * [mode]
/// * [email]
/// * [password]
/// * [turnstileToken]
@BuiltValue()
abstract class EmailAuthRequest implements Built<EmailAuthRequest, EmailAuthRequestBuilder> {
  @BuiltValueField(wireName: r'mode')
  EmailAuthRequestModeEnum get mode;
  // enum modeEnum {  login,  register,  resend_verification,  };

  @BuiltValueField(wireName: r'email')
  String get email;

  @BuiltValueField(wireName: r'password')
  String? get password;

  @BuiltValueField(wireName: r'turnstileToken')
  String? get turnstileToken;

  EmailAuthRequest._();

  factory EmailAuthRequest([void updates(EmailAuthRequestBuilder b)]) = _$EmailAuthRequest;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(EmailAuthRequestBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<EmailAuthRequest> get serializer => _$EmailAuthRequestSerializer();
}

class _$EmailAuthRequestSerializer implements PrimitiveSerializer<EmailAuthRequest> {
  @override
  final Iterable<Type> types = const [EmailAuthRequest, _$EmailAuthRequest];

  @override
  final String wireName = r'EmailAuthRequest';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    EmailAuthRequest object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    yield r'mode';
    yield serializers.serialize(
      object.mode,
      specifiedType: const FullType(EmailAuthRequestModeEnum),
    );
    yield r'email';
    yield serializers.serialize(
      object.email,
      specifiedType: const FullType(String),
    );
    if (object.password != null) {
      yield r'password';
      yield serializers.serialize(
        object.password,
        specifiedType: const FullType(String),
      );
    }
    if (object.turnstileToken != null) {
      yield r'turnstileToken';
      yield serializers.serialize(
        object.turnstileToken,
        specifiedType: const FullType(String),
      );
    }
  }

  @override
  Object serialize(
    Serializers serializers,
    EmailAuthRequest object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required EmailAuthRequestBuilder result,
    required List<Object?> unhandled,
  }) {
    for (var i = 0; i < serializedList.length; i += 2) {
      final key = serializedList[i] as String;
      final value = serializedList[i + 1];
      switch (key) {
        case r'mode':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(EmailAuthRequestModeEnum),
          ) as EmailAuthRequestModeEnum;
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
  EmailAuthRequest deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = EmailAuthRequestBuilder();
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

class EmailAuthRequestModeEnum extends EnumClass {

  @BuiltValueEnumConst(wireName: r'login')
  static const EmailAuthRequestModeEnum login = _$emailAuthRequestModeEnum_login;
  @BuiltValueEnumConst(wireName: r'register')
  static const EmailAuthRequestModeEnum register = _$emailAuthRequestModeEnum_register;
  @BuiltValueEnumConst(wireName: r'resend_verification')
  static const EmailAuthRequestModeEnum resendVerification = _$emailAuthRequestModeEnum_resendVerification;

  static Serializer<EmailAuthRequestModeEnum> get serializer => _$emailAuthRequestModeEnumSerializer;

  const EmailAuthRequestModeEnum._(String name): super(name);

  static BuiltSet<EmailAuthRequestModeEnum> get values => _$emailAuthRequestModeEnumValues;
  static EmailAuthRequestModeEnum valueOf(String name) => _$emailAuthRequestModeEnumValueOf(name);
}
