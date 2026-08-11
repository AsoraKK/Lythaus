//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:built_collection/built_collection.dart';
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'media_upload_session_created.g.dart';

/// MediaUploadSessionCreated
///
/// Properties:
/// * [uploadSessionId]
/// * [objectKey]
/// * [putUrl]
/// * [expiresAt]
/// * [contentType]
/// * [maxBytes]
/// * [checksumSha256]
@BuiltValue()
abstract class MediaUploadSessionCreated implements Built<MediaUploadSessionCreated, MediaUploadSessionCreatedBuilder> {
  @BuiltValueField(wireName: r'uploadSessionId')
  String get uploadSessionId;

  @BuiltValueField(wireName: r'objectKey')
  String get objectKey;

  @BuiltValueField(wireName: r'putUrl')
  String get putUrl;

  @BuiltValueField(wireName: r'expiresAt')
  DateTime get expiresAt;

  @BuiltValueField(wireName: r'contentType')
  MediaUploadSessionCreatedContentTypeEnum get contentType;
  // enum contentTypeEnum {  image/jpeg,  image/png,  image/webp,  image/avif,  };

  @BuiltValueField(wireName: r'maxBytes')
  int get maxBytes;

  @BuiltValueField(wireName: r'checksumSha256')
  String get checksumSha256;

  MediaUploadSessionCreated._();

  factory MediaUploadSessionCreated([void updates(MediaUploadSessionCreatedBuilder b)]) = _$MediaUploadSessionCreated;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(MediaUploadSessionCreatedBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<MediaUploadSessionCreated> get serializer => _$MediaUploadSessionCreatedSerializer();
}

class _$MediaUploadSessionCreatedSerializer implements PrimitiveSerializer<MediaUploadSessionCreated> {
  @override
  final Iterable<Type> types = const [MediaUploadSessionCreated, _$MediaUploadSessionCreated];

  @override
  final String wireName = r'MediaUploadSessionCreated';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    MediaUploadSessionCreated object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    yield r'uploadSessionId';
    yield serializers.serialize(
      object.uploadSessionId,
      specifiedType: const FullType(String),
    );
    yield r'objectKey';
    yield serializers.serialize(
      object.objectKey,
      specifiedType: const FullType(String),
    );
    yield r'putUrl';
    yield serializers.serialize(
      object.putUrl,
      specifiedType: const FullType(String),
    );
    yield r'expiresAt';
    yield serializers.serialize(
      object.expiresAt,
      specifiedType: const FullType(DateTime),
    );
    yield r'contentType';
    yield serializers.serialize(
      object.contentType,
      specifiedType: const FullType(MediaUploadSessionCreatedContentTypeEnum),
    );
    yield r'maxBytes';
    yield serializers.serialize(
      object.maxBytes,
      specifiedType: const FullType(int),
    );
    yield r'checksumSha256';
    yield serializers.serialize(
      object.checksumSha256,
      specifiedType: const FullType(String),
    );
  }

  @override
  Object serialize(
    Serializers serializers,
    MediaUploadSessionCreated object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required MediaUploadSessionCreatedBuilder result,
    required List<Object?> unhandled,
  }) {
    for (var i = 0; i < serializedList.length; i += 2) {
      final key = serializedList[i] as String;
      final value = serializedList[i + 1];
      switch (key) {
        case r'uploadSessionId':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.uploadSessionId = valueDes;
          break;
        case r'objectKey':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.objectKey = valueDes;
          break;
        case r'putUrl':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.putUrl = valueDes;
          break;
        case r'expiresAt':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(DateTime),
          ) as DateTime;
          result.expiresAt = valueDes;
          break;
        case r'contentType':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(MediaUploadSessionCreatedContentTypeEnum),
          ) as MediaUploadSessionCreatedContentTypeEnum;
          result.contentType = valueDes;
          break;
        case r'maxBytes':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(int),
          ) as int;
          result.maxBytes = valueDes;
          break;
        case r'checksumSha256':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.checksumSha256 = valueDes;
          break;
        default:
          unhandled.add(key);
          unhandled.add(value);
          break;
      }
    }
  }

  @override
  MediaUploadSessionCreated deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = MediaUploadSessionCreatedBuilder();
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

class MediaUploadSessionCreatedContentTypeEnum extends EnumClass {

  @BuiltValueEnumConst(wireName: r'image/jpeg')
  static const MediaUploadSessionCreatedContentTypeEnum jpeg = _$mediaUploadSessionCreatedContentTypeEnum_jpeg;
  @BuiltValueEnumConst(wireName: r'image/png')
  static const MediaUploadSessionCreatedContentTypeEnum png = _$mediaUploadSessionCreatedContentTypeEnum_png;
  @BuiltValueEnumConst(wireName: r'image/webp')
  static const MediaUploadSessionCreatedContentTypeEnum webp = _$mediaUploadSessionCreatedContentTypeEnum_webp;
  @BuiltValueEnumConst(wireName: r'image/avif')
  static const MediaUploadSessionCreatedContentTypeEnum avif = _$mediaUploadSessionCreatedContentTypeEnum_avif;

  static Serializer<MediaUploadSessionCreatedContentTypeEnum> get serializer => _$mediaUploadSessionCreatedContentTypeEnumSerializer;

  const MediaUploadSessionCreatedContentTypeEnum._(String name): super(name);

  static BuiltSet<MediaUploadSessionCreatedContentTypeEnum> get values => _$mediaUploadSessionCreatedContentTypeEnumValues;
  static MediaUploadSessionCreatedContentTypeEnum valueOf(String name) => _$mediaUploadSessionCreatedContentTypeEnumValueOf(name);
}
