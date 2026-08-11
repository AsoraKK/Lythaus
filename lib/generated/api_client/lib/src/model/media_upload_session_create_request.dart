//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:built_collection/built_collection.dart';
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'media_upload_session_create_request.g.dart';

/// MediaUploadSessionCreateRequest
///
/// Properties:
/// * [contentType]
/// * [size]
/// * [checksumSha256]
@BuiltValue()
abstract class MediaUploadSessionCreateRequest implements Built<MediaUploadSessionCreateRequest, MediaUploadSessionCreateRequestBuilder> {
  @BuiltValueField(wireName: r'contentType')
  MediaUploadSessionCreateRequestContentTypeEnum get contentType;
  // enum contentTypeEnum {  image/jpeg,  image/png,  image/webp,  image/avif,  };

  @BuiltValueField(wireName: r'size')
  int get size;

  @BuiltValueField(wireName: r'checksumSha256')
  String get checksumSha256;

  MediaUploadSessionCreateRequest._();

  factory MediaUploadSessionCreateRequest([void updates(MediaUploadSessionCreateRequestBuilder b)]) = _$MediaUploadSessionCreateRequest;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(MediaUploadSessionCreateRequestBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<MediaUploadSessionCreateRequest> get serializer => _$MediaUploadSessionCreateRequestSerializer();
}

class _$MediaUploadSessionCreateRequestSerializer implements PrimitiveSerializer<MediaUploadSessionCreateRequest> {
  @override
  final Iterable<Type> types = const [MediaUploadSessionCreateRequest, _$MediaUploadSessionCreateRequest];

  @override
  final String wireName = r'MediaUploadSessionCreateRequest';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    MediaUploadSessionCreateRequest object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    yield r'contentType';
    yield serializers.serialize(
      object.contentType,
      specifiedType: const FullType(MediaUploadSessionCreateRequestContentTypeEnum),
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
  }

  @override
  Object serialize(
    Serializers serializers,
    MediaUploadSessionCreateRequest object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required MediaUploadSessionCreateRequestBuilder result,
    required List<Object?> unhandled,
  }) {
    for (var i = 0; i < serializedList.length; i += 2) {
      final key = serializedList[i] as String;
      final value = serializedList[i + 1];
      switch (key) {
        case r'contentType':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(MediaUploadSessionCreateRequestContentTypeEnum),
          ) as MediaUploadSessionCreateRequestContentTypeEnum;
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
        default:
          unhandled.add(key);
          unhandled.add(value);
          break;
      }
    }
  }

  @override
  MediaUploadSessionCreateRequest deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = MediaUploadSessionCreateRequestBuilder();
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

class MediaUploadSessionCreateRequestContentTypeEnum extends EnumClass {

  @BuiltValueEnumConst(wireName: r'image/jpeg')
  static const MediaUploadSessionCreateRequestContentTypeEnum jpeg = _$mediaUploadSessionCreateRequestContentTypeEnum_jpeg;
  @BuiltValueEnumConst(wireName: r'image/png')
  static const MediaUploadSessionCreateRequestContentTypeEnum png = _$mediaUploadSessionCreateRequestContentTypeEnum_png;
  @BuiltValueEnumConst(wireName: r'image/webp')
  static const MediaUploadSessionCreateRequestContentTypeEnum webp = _$mediaUploadSessionCreateRequestContentTypeEnum_webp;
  @BuiltValueEnumConst(wireName: r'image/avif')
  static const MediaUploadSessionCreateRequestContentTypeEnum avif = _$mediaUploadSessionCreateRequestContentTypeEnum_avif;

  static Serializer<MediaUploadSessionCreateRequestContentTypeEnum> get serializer => _$mediaUploadSessionCreateRequestContentTypeEnumSerializer;

  const MediaUploadSessionCreateRequestContentTypeEnum._(String name): super(name);

  static BuiltSet<MediaUploadSessionCreateRequestContentTypeEnum> get values => _$mediaUploadSessionCreateRequestContentTypeEnumValues;
  static MediaUploadSessionCreateRequestContentTypeEnum valueOf(String name) => _$mediaUploadSessionCreateRequestContentTypeEnumValueOf(name);
}
