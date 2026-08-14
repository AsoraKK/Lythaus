//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:built_collection/built_collection.dart';
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'waitlist_submission.g.dart';

/// WaitlistSubmission
///
/// Properties:
/// * [email]
/// * [turnstileToken]
/// * [consentVersion]
@BuiltValue()
abstract class WaitlistSubmission implements Built<WaitlistSubmission, WaitlistSubmissionBuilder> {
  @BuiltValueField(wireName: r'email')
  String get email;

  @BuiltValueField(wireName: r'turnstileToken')
  String get turnstileToken;

  @BuiltValueField(wireName: r'consentVersion')
  WaitlistSubmissionConsentVersionEnum get consentVersion;
  // enum consentVersionEnum {  waitlist-v1,  };

  WaitlistSubmission._();

  factory WaitlistSubmission([void updates(WaitlistSubmissionBuilder b)]) = _$WaitlistSubmission;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(WaitlistSubmissionBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<WaitlistSubmission> get serializer => _$WaitlistSubmissionSerializer();
}

class _$WaitlistSubmissionSerializer implements PrimitiveSerializer<WaitlistSubmission> {
  @override
  final Iterable<Type> types = const [WaitlistSubmission, _$WaitlistSubmission];

  @override
  final String wireName = r'WaitlistSubmission';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    WaitlistSubmission object, {
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
    yield r'consentVersion';
    yield serializers.serialize(
      object.consentVersion,
      specifiedType: const FullType(WaitlistSubmissionConsentVersionEnum),
    );
  }

  @override
  Object serialize(
    Serializers serializers,
    WaitlistSubmission object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required WaitlistSubmissionBuilder result,
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
        case r'consentVersion':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(WaitlistSubmissionConsentVersionEnum),
          ) as WaitlistSubmissionConsentVersionEnum;
          result.consentVersion = valueDes;
          break;
        default:
          unhandled.add(key);
          unhandled.add(value);
          break;
      }
    }
  }

  @override
  WaitlistSubmission deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = WaitlistSubmissionBuilder();
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

class WaitlistSubmissionConsentVersionEnum extends EnumClass {

  @BuiltValueEnumConst(wireName: r'waitlist-v1')
  static const WaitlistSubmissionConsentVersionEnum waitlistV1 = _$waitlistSubmissionConsentVersionEnum_waitlistV1;

  static Serializer<WaitlistSubmissionConsentVersionEnum> get serializer => _$waitlistSubmissionConsentVersionEnumSerializer;

  const WaitlistSubmissionConsentVersionEnum._(String name): super(name);

  static BuiltSet<WaitlistSubmissionConsentVersionEnum> get values => _$waitlistSubmissionConsentVersionEnumValues;
  static WaitlistSubmissionConsentVersionEnum valueOf(String name) => _$waitlistSubmissionConsentVersionEnumValueOf(name);
}
