//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:built_collection/built_collection.dart';
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'email_verification_response.g.dart';

/// Private verification result. The response contains no user or email identifier.
///
/// Properties:
/// * [state]
@BuiltValue()
abstract class EmailVerificationResponse implements Built<EmailVerificationResponse, EmailVerificationResponseBuilder> {
  @BuiltValueField(wireName: r'state')
  EmailVerificationResponseStateEnum get state;
  // enum stateEnum {  verified,  };

  EmailVerificationResponse._();

  factory EmailVerificationResponse([void updates(EmailVerificationResponseBuilder b)]) = _$EmailVerificationResponse;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(EmailVerificationResponseBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<EmailVerificationResponse> get serializer => _$EmailVerificationResponseSerializer();
}

class _$EmailVerificationResponseSerializer implements PrimitiveSerializer<EmailVerificationResponse> {
  @override
  final Iterable<Type> types = const [EmailVerificationResponse, _$EmailVerificationResponse];

  @override
  final String wireName = r'EmailVerificationResponse';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    EmailVerificationResponse object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    yield r'state';
    yield serializers.serialize(
      object.state,
      specifiedType: const FullType(EmailVerificationResponseStateEnum),
    );
  }

  @override
  Object serialize(
    Serializers serializers,
    EmailVerificationResponse object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required EmailVerificationResponseBuilder result,
    required List<Object?> unhandled,
  }) {
    for (var i = 0; i < serializedList.length; i += 2) {
      final key = serializedList[i] as String;
      final value = serializedList[i + 1];
      switch (key) {
        case r'state':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(EmailVerificationResponseStateEnum),
          ) as EmailVerificationResponseStateEnum;
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
  EmailVerificationResponse deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = EmailVerificationResponseBuilder();
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

class EmailVerificationResponseStateEnum extends EnumClass {

  @BuiltValueEnumConst(wireName: r'verified')
  static const EmailVerificationResponseStateEnum verified = _$emailVerificationResponseStateEnum_verified;

  static Serializer<EmailVerificationResponseStateEnum> get serializer => _$emailVerificationResponseStateEnumSerializer;

  const EmailVerificationResponseStateEnum._(String name): super(name);

  static BuiltSet<EmailVerificationResponseStateEnum> get values => _$emailVerificationResponseStateEnumValues;
  static EmailVerificationResponseStateEnum valueOf(String name) => _$emailVerificationResponseStateEnumValueOf(name);
}
