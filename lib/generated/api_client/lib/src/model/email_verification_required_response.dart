//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:built_collection/built_collection.dart';
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'email_verification_required_response.g.dart';

/// EmailVerificationRequiredResponse
///
/// Properties:
/// * [state]
/// * [userId]
@BuiltValue()
abstract class EmailVerificationRequiredResponse implements Built<EmailVerificationRequiredResponse, EmailVerificationRequiredResponseBuilder> {
  @BuiltValueField(wireName: r'state')
  EmailVerificationRequiredResponseStateEnum get state;
  // enum stateEnum {  verification_required,  };

  @BuiltValueField(wireName: r'userId')
  String? get userId;

  EmailVerificationRequiredResponse._();

  factory EmailVerificationRequiredResponse([void updates(EmailVerificationRequiredResponseBuilder b)]) = _$EmailVerificationRequiredResponse;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(EmailVerificationRequiredResponseBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<EmailVerificationRequiredResponse> get serializer => _$EmailVerificationRequiredResponseSerializer();
}

class _$EmailVerificationRequiredResponseSerializer implements PrimitiveSerializer<EmailVerificationRequiredResponse> {
  @override
  final Iterable<Type> types = const [EmailVerificationRequiredResponse, _$EmailVerificationRequiredResponse];

  @override
  final String wireName = r'EmailVerificationRequiredResponse';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    EmailVerificationRequiredResponse object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    yield r'state';
    yield serializers.serialize(
      object.state,
      specifiedType: const FullType(EmailVerificationRequiredResponseStateEnum),
    );
    if (object.userId != null) {
      yield r'userId';
      yield serializers.serialize(
        object.userId,
        specifiedType: const FullType(String),
      );
    }
  }

  @override
  Object serialize(
    Serializers serializers,
    EmailVerificationRequiredResponse object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required EmailVerificationRequiredResponseBuilder result,
    required List<Object?> unhandled,
  }) {
    for (var i = 0; i < serializedList.length; i += 2) {
      final key = serializedList[i] as String;
      final value = serializedList[i + 1];
      switch (key) {
        case r'state':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(EmailVerificationRequiredResponseStateEnum),
          ) as EmailVerificationRequiredResponseStateEnum;
          result.state = valueDes;
          break;
        case r'userId':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.userId = valueDes;
          break;
        default:
          unhandled.add(key);
          unhandled.add(value);
          break;
      }
    }
  }

  @override
  EmailVerificationRequiredResponse deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = EmailVerificationRequiredResponseBuilder();
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

class EmailVerificationRequiredResponseStateEnum extends EnumClass {

  @BuiltValueEnumConst(wireName: r'verification_required')
  static const EmailVerificationRequiredResponseStateEnum verificationRequired = _$emailVerificationRequiredResponseStateEnum_verificationRequired;

  static Serializer<EmailVerificationRequiredResponseStateEnum> get serializer => _$emailVerificationRequiredResponseStateEnumSerializer;

  const EmailVerificationRequiredResponseStateEnum._(String name): super(name);

  static BuiltSet<EmailVerificationRequiredResponseStateEnum> get values => _$emailVerificationRequiredResponseStateEnumValues;
  static EmailVerificationRequiredResponseStateEnum valueOf(String name) => _$emailVerificationRequiredResponseStateEnumValueOf(name);
}
