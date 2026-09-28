//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:built_collection/built_collection.dart';
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'alpha_create_request.g.dart';

/// AlphaCreateRequest
///
/// Properties:
/// * [contentKind]
/// * [text]
/// * [contentType]
/// * [size]
/// * [checksumSha256]
/// * [observerRequested]
/// * [explanationRequested]
/// * [consentVersion]
/// * [trainingConsent]
@BuiltValue()
abstract class AlphaCreateRequest implements Built<AlphaCreateRequest, AlphaCreateRequestBuilder> {
  @BuiltValueField(wireName: r'contentKind')
  AlphaCreateRequestContentKindEnum get contentKind;
  // enum contentKindEnum {  text,  image,  text_image,  };

  @BuiltValueField(wireName: r'text')
  String? get text;

  @BuiltValueField(wireName: r'contentType')
  AlphaCreateRequestContentTypeEnum? get contentType;
  // enum contentTypeEnum {  image/png,  image/jpeg,  };

  @BuiltValueField(wireName: r'size')
  int? get size;

  @BuiltValueField(wireName: r'checksumSha256')
  String? get checksumSha256;

  @BuiltValueField(wireName: r'observerRequested')
  bool? get observerRequested;

  @BuiltValueField(wireName: r'explanationRequested')
  bool? get explanationRequested;

  @BuiltValueField(wireName: r'consentVersion')
  AlphaCreateRequestConsentVersionEnum get consentVersion;
  // enum consentVersionEnum {  lythaus-authenticity-private-alpha-v0.1.0,  };

  @BuiltValueField(wireName: r'trainingConsent')
  bool get trainingConsent;

  AlphaCreateRequest._();

  factory AlphaCreateRequest([void updates(AlphaCreateRequestBuilder b)]) = _$AlphaCreateRequest;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(AlphaCreateRequestBuilder b) => b
      ..observerRequested = false
      ..explanationRequested = false;

  @BuiltValueSerializer(custom: true)
  static Serializer<AlphaCreateRequest> get serializer => _$AlphaCreateRequestSerializer();
}

class _$AlphaCreateRequestSerializer implements PrimitiveSerializer<AlphaCreateRequest> {
  @override
  final Iterable<Type> types = const [AlphaCreateRequest, _$AlphaCreateRequest];

  @override
  final String wireName = r'AlphaCreateRequest';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    AlphaCreateRequest object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    yield r'contentKind';
    yield serializers.serialize(
      object.contentKind,
      specifiedType: const FullType(AlphaCreateRequestContentKindEnum),
    );
    if (object.text != null) {
      yield r'text';
      yield serializers.serialize(
        object.text,
        specifiedType: const FullType(String),
      );
    }
    if (object.contentType != null) {
      yield r'contentType';
      yield serializers.serialize(
        object.contentType,
        specifiedType: const FullType(AlphaCreateRequestContentTypeEnum),
      );
    }
    if (object.size != null) {
      yield r'size';
      yield serializers.serialize(
        object.size,
        specifiedType: const FullType(int),
      );
    }
    if (object.checksumSha256 != null) {
      yield r'checksumSha256';
      yield serializers.serialize(
        object.checksumSha256,
        specifiedType: const FullType(String),
      );
    }
    if (object.observerRequested != null) {
      yield r'observerRequested';
      yield serializers.serialize(
        object.observerRequested,
        specifiedType: const FullType(bool),
      );
    }
    if (object.explanationRequested != null) {
      yield r'explanationRequested';
      yield serializers.serialize(
        object.explanationRequested,
        specifiedType: const FullType(bool),
      );
    }
    yield r'consentVersion';
    yield serializers.serialize(
      object.consentVersion,
      specifiedType: const FullType(AlphaCreateRequestConsentVersionEnum),
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
    AlphaCreateRequest object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required AlphaCreateRequestBuilder result,
    required List<Object?> unhandled,
  }) {
    for (var i = 0; i < serializedList.length; i += 2) {
      final key = serializedList[i] as String;
      final value = serializedList[i + 1];
      switch (key) {
        case r'contentKind':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(AlphaCreateRequestContentKindEnum),
          ) as AlphaCreateRequestContentKindEnum;
          result.contentKind = valueDes;
          break;
        case r'text':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.text = valueDes;
          break;
        case r'contentType':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(AlphaCreateRequestContentTypeEnum),
          ) as AlphaCreateRequestContentTypeEnum;
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
        case r'observerRequested':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(bool),
          ) as bool;
          result.observerRequested = valueDes;
          break;
        case r'explanationRequested':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(bool),
          ) as bool;
          result.explanationRequested = valueDes;
          break;
        case r'consentVersion':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(AlphaCreateRequestConsentVersionEnum),
          ) as AlphaCreateRequestConsentVersionEnum;
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
  AlphaCreateRequest deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = AlphaCreateRequestBuilder();
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

class AlphaCreateRequestContentKindEnum extends EnumClass {

  @BuiltValueEnumConst(wireName: r'text')
  static const AlphaCreateRequestContentKindEnum text = _$alphaCreateRequestContentKindEnum_text;
  @BuiltValueEnumConst(wireName: r'image')
  static const AlphaCreateRequestContentKindEnum image = _$alphaCreateRequestContentKindEnum_image;
  @BuiltValueEnumConst(wireName: r'text_image')
  static const AlphaCreateRequestContentKindEnum textImage = _$alphaCreateRequestContentKindEnum_textImage;

  static Serializer<AlphaCreateRequestContentKindEnum> get serializer => _$alphaCreateRequestContentKindEnumSerializer;

  const AlphaCreateRequestContentKindEnum._(String name): super(name);

  static BuiltSet<AlphaCreateRequestContentKindEnum> get values => _$alphaCreateRequestContentKindEnumValues;
  static AlphaCreateRequestContentKindEnum valueOf(String name) => _$alphaCreateRequestContentKindEnumValueOf(name);
}

class AlphaCreateRequestContentTypeEnum extends EnumClass {

  @BuiltValueEnumConst(wireName: r'image/png')
  static const AlphaCreateRequestContentTypeEnum png = _$alphaCreateRequestContentTypeEnum_png;
  @BuiltValueEnumConst(wireName: r'image/jpeg')
  static const AlphaCreateRequestContentTypeEnum jpeg = _$alphaCreateRequestContentTypeEnum_jpeg;

  static Serializer<AlphaCreateRequestContentTypeEnum> get serializer => _$alphaCreateRequestContentTypeEnumSerializer;

  const AlphaCreateRequestContentTypeEnum._(String name): super(name);

  static BuiltSet<AlphaCreateRequestContentTypeEnum> get values => _$alphaCreateRequestContentTypeEnumValues;
  static AlphaCreateRequestContentTypeEnum valueOf(String name) => _$alphaCreateRequestContentTypeEnumValueOf(name);
}

class AlphaCreateRequestConsentVersionEnum extends EnumClass {

  @BuiltValueEnumConst(wireName: r'lythaus-authenticity-private-alpha-v0.1.0')
  static const AlphaCreateRequestConsentVersionEnum lythausAuthenticityPrivateAlphaV0Period1Period0 = _$alphaCreateRequestConsentVersionEnum_lythausAuthenticityPrivateAlphaV0Period1Period0;

  static Serializer<AlphaCreateRequestConsentVersionEnum> get serializer => _$alphaCreateRequestConsentVersionEnumSerializer;

  const AlphaCreateRequestConsentVersionEnum._(String name): super(name);

  static BuiltSet<AlphaCreateRequestConsentVersionEnum> get values => _$alphaCreateRequestConsentVersionEnumValues;
  static AlphaCreateRequestConsentVersionEnum valueOf(String name) => _$alphaCreateRequestConsentVersionEnumValueOf(name);
}
