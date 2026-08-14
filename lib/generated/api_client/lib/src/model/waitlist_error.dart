//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:built_collection/built_collection.dart';
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'waitlist_error.g.dart';

/// WaitlistError
///
/// Properties:
/// * [error]
/// * [correlationId]
@BuiltValue()
abstract class WaitlistError implements Built<WaitlistError, WaitlistErrorBuilder> {
  @BuiltValueField(wireName: r'error')
  WaitlistErrorErrorEnum get error;
  // enum errorEnum {  invalid_email,  invalid_json,  invalid_consent_version,  request_too_large,  turnstile_required,  turnstile_failed,  turnstile_unavailable,  rate_limit_exceeded,  unsupported_content_type,  waitlist_unavailable,  request_failed,  };

  @BuiltValueField(wireName: r'correlationId')
  String get correlationId;

  WaitlistError._();

  factory WaitlistError([void updates(WaitlistErrorBuilder b)]) = _$WaitlistError;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(WaitlistErrorBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<WaitlistError> get serializer => _$WaitlistErrorSerializer();
}

class _$WaitlistErrorSerializer implements PrimitiveSerializer<WaitlistError> {
  @override
  final Iterable<Type> types = const [WaitlistError, _$WaitlistError];

  @override
  final String wireName = r'WaitlistError';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    WaitlistError object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    yield r'error';
    yield serializers.serialize(
      object.error,
      specifiedType: const FullType(WaitlistErrorErrorEnum),
    );
    yield r'correlationId';
    yield serializers.serialize(
      object.correlationId,
      specifiedType: const FullType(String),
    );
  }

  @override
  Object serialize(
    Serializers serializers,
    WaitlistError object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required WaitlistErrorBuilder result,
    required List<Object?> unhandled,
  }) {
    for (var i = 0; i < serializedList.length; i += 2) {
      final key = serializedList[i] as String;
      final value = serializedList[i + 1];
      switch (key) {
        case r'error':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(WaitlistErrorErrorEnum),
          ) as WaitlistErrorErrorEnum;
          result.error = valueDes;
          break;
        case r'correlationId':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.correlationId = valueDes;
          break;
        default:
          unhandled.add(key);
          unhandled.add(value);
          break;
      }
    }
  }

  @override
  WaitlistError deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = WaitlistErrorBuilder();
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

class WaitlistErrorErrorEnum extends EnumClass {

  @BuiltValueEnumConst(wireName: r'invalid_email')
  static const WaitlistErrorErrorEnum invalidEmail = _$waitlistErrorErrorEnum_invalidEmail;
  @BuiltValueEnumConst(wireName: r'invalid_json')
  static const WaitlistErrorErrorEnum invalidJson = _$waitlistErrorErrorEnum_invalidJson;
  @BuiltValueEnumConst(wireName: r'invalid_consent_version')
  static const WaitlistErrorErrorEnum invalidConsentVersion = _$waitlistErrorErrorEnum_invalidConsentVersion;
  @BuiltValueEnumConst(wireName: r'request_too_large')
  static const WaitlistErrorErrorEnum requestTooLarge = _$waitlistErrorErrorEnum_requestTooLarge;
  @BuiltValueEnumConst(wireName: r'turnstile_required')
  static const WaitlistErrorErrorEnum turnstileRequired = _$waitlistErrorErrorEnum_turnstileRequired;
  @BuiltValueEnumConst(wireName: r'turnstile_failed')
  static const WaitlistErrorErrorEnum turnstileFailed = _$waitlistErrorErrorEnum_turnstileFailed;
  @BuiltValueEnumConst(wireName: r'turnstile_unavailable')
  static const WaitlistErrorErrorEnum turnstileUnavailable = _$waitlistErrorErrorEnum_turnstileUnavailable;
  @BuiltValueEnumConst(wireName: r'rate_limit_exceeded')
  static const WaitlistErrorErrorEnum rateLimitExceeded = _$waitlistErrorErrorEnum_rateLimitExceeded;
  @BuiltValueEnumConst(wireName: r'unsupported_content_type')
  static const WaitlistErrorErrorEnum unsupportedContentType = _$waitlistErrorErrorEnum_unsupportedContentType;
  @BuiltValueEnumConst(wireName: r'waitlist_unavailable')
  static const WaitlistErrorErrorEnum waitlistUnavailable = _$waitlistErrorErrorEnum_waitlistUnavailable;
  @BuiltValueEnumConst(wireName: r'request_failed')
  static const WaitlistErrorErrorEnum requestFailed = _$waitlistErrorErrorEnum_requestFailed;

  static Serializer<WaitlistErrorErrorEnum> get serializer => _$waitlistErrorErrorEnumSerializer;

  const WaitlistErrorErrorEnum._(String name): super(name);

  static BuiltSet<WaitlistErrorErrorEnum> get values => _$waitlistErrorErrorEnumValues;
  static WaitlistErrorErrorEnum valueOf(String name) => _$waitlistErrorErrorEnumValueOf(name);
}
