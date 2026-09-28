//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:built_collection/built_collection.dart';
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'beta_submission.g.dart';

/// BetaSubmission
///
/// Properties:
/// * [contentType]
/// * [size]
/// * [checksumSha256]
/// * [consentVersion]
/// * [trainingConsent]
@BuiltValue()
abstract class BetaSubmission implements Built<BetaSubmission, BetaSubmissionBuilder> {
  @BuiltValueField(wireName: r'contentType')
  BetaSubmissionContentTypeEnum get contentType;
  // enum contentTypeEnum {  image/png,  image/jpeg,  };

  @BuiltValueField(wireName: r'size')
  int get size;

  @BuiltValueField(wireName: r'checksumSha256')
  String get checksumSha256;

  @BuiltValueField(wireName: r'consentVersion')
  BetaSubmissionConsentVersionEnum get consentVersion;
  // enum consentVersionEnum {  lythaus-authenticity-beta-v0.1.0,  };

  @BuiltValueField(wireName: r'trainingConsent')
  bool get trainingConsent;

  BetaSubmission._();

  factory BetaSubmission([void updates(BetaSubmissionBuilder b)]) = _$BetaSubmission;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(BetaSubmissionBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<BetaSubmission> get serializer => _$BetaSubmissionSerializer();
}

class _$BetaSubmissionSerializer implements PrimitiveSerializer<BetaSubmission> {
  @override
  final Iterable<Type> types = const [BetaSubmission, _$BetaSubmission];

  @override
  final String wireName = r'BetaSubmission';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    BetaSubmission object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    yield r'contentType';
    yield serializers.serialize(
      object.contentType,
      specifiedType: const FullType(BetaSubmissionContentTypeEnum),
    );
    yield r'size';
    yield serializers.serialize(
      object.size,
      specifiedType: const FullType(int),
    );
    yield r'checksumSha256';
    yield serializers.serialize(
      object.checksumSha256,
      specifiedType: const FullType(String),
    );
    yield r'consentVersion';
    yield serializers.serialize(
      object.consentVersion,
      specifiedType: const FullType(BetaSubmissionConsentVersionEnum),
    );
    yield r'trainingConsent';
    yield serializers.serialize(
      object.trainingConsent,
      specifiedType: const FullType(bool),
    );
  }

  @override
  Object serialize(
    Serializers serializers,
    BetaSubmission object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required BetaSubmissionBuilder result,
    required List<Object?> unhandled,
  }) {
    for (var i = 0; i < serializedList.length; i += 2) {
      final key = serializedList[i] as String;
      final value = serializedList[i + 1];
      switch (key) {
        case r'contentType':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(BetaSubmissionContentTypeEnum),
          ) as BetaSubmissionContentTypeEnum;
          result.contentType = valueDes;
          break;
        case r'size':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(int),
          ) as int;
          result.size = valueDes;
          break;
        case r'checksumSha256':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.checksumSha256 = valueDes;
          break;
        case r'consentVersion':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(BetaSubmissionConsentVersionEnum),
          ) as BetaSubmissionConsentVersionEnum;
          result.consentVersion = valueDes;
          break;
        case r'trainingConsent':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(bool),
          ) as bool;
          result.trainingConsent = valueDes;
          break;
        default:
          unhandled.add(key);
          unhandled.add(value);
          break;
      }
    }
  }

  @override
  BetaSubmission deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = BetaSubmissionBuilder();
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

class BetaSubmissionContentTypeEnum extends EnumClass {

  @BuiltValueEnumConst(wireName: r'image/png')
  static const BetaSubmissionContentTypeEnum png = _$betaSubmissionContentTypeEnum_png;
  @BuiltValueEnumConst(wireName: r'image/jpeg')
  static const BetaSubmissionContentTypeEnum jpeg = _$betaSubmissionContentTypeEnum_jpeg;

  static Serializer<BetaSubmissionContentTypeEnum> get serializer => _$betaSubmissionContentTypeEnumSerializer;

  const BetaSubmissionContentTypeEnum._(String name): super(name);

  static BuiltSet<BetaSubmissionContentTypeEnum> get values => _$betaSubmissionContentTypeEnumValues;
  static BetaSubmissionContentTypeEnum valueOf(String name) => _$betaSubmissionContentTypeEnumValueOf(name);
}

class BetaSubmissionConsentVersionEnum extends EnumClass {

  @BuiltValueEnumConst(wireName: r'lythaus-authenticity-beta-v0.1.0')
  static const BetaSubmissionConsentVersionEnum lythausAuthenticityBetaV0Period1Period0 = _$betaSubmissionConsentVersionEnum_lythausAuthenticityBetaV0Period1Period0;

  static Serializer<BetaSubmissionConsentVersionEnum> get serializer => _$betaSubmissionConsentVersionEnumSerializer;

  const BetaSubmissionConsentVersionEnum._(String name): super(name);

  static BuiltSet<BetaSubmissionConsentVersionEnum> get values => _$betaSubmissionConsentVersionEnumValues;
  static BetaSubmissionConsentVersionEnum valueOf(String name) => _$betaSubmissionConsentVersionEnumValueOf(name);
}
