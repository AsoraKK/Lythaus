//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'email_verification_request.g.dart';

/// EmailVerificationRequest
///
/// Properties:
/// * [token] - Single-use opaque email-verification token.
@BuiltValue()
abstract class EmailVerificationRequest implements Built<EmailVerificationRequest, EmailVerificationRequestBuilder> {
  /// Single-use opaque email-verification token.
  @BuiltValueField(wireName: r'token')
  String get token;

  EmailVerificationRequest._();

  factory EmailVerificationRequest([void updates(EmailVerificationRequestBuilder b)]) = _$EmailVerificationRequest;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(EmailVerificationRequestBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<EmailVerificationRequest> get serializer => _$EmailVerificationRequestSerializer();
}

class _$EmailVerificationRequestSerializer implements PrimitiveSerializer<EmailVerificationRequest> {
  @override
  final Iterable<Type> types = const [EmailVerificationRequest, _$EmailVerificationRequest];

  @override
  final String wireName = r'EmailVerificationRequest';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    EmailVerificationRequest object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    yield r'token';
    yield serializers.serialize(
      object.token,
      specifiedType: const FullType(String),
    );
  }

  @override
  Object serialize(
    Serializers serializers,
    EmailVerificationRequest object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required EmailVerificationRequestBuilder result,
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
        default:
          unhandled.add(key);
          unhandled.add(value);
          break;
      }
    }
  }

  @override
  EmailVerificationRequest deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = EmailVerificationRequestBuilder();
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
