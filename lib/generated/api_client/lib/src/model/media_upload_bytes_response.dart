//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:built_collection/built_collection.dart';
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'media_upload_bytes_response.g.dart';

/// MediaUploadBytesResponse
///
/// Properties:
/// * [uploadSessionId]
/// * [status]
@BuiltValue()
abstract class MediaUploadBytesResponse implements Built<MediaUploadBytesResponse, MediaUploadBytesResponseBuilder> {
  @BuiltValueField(wireName: r'uploadSessionId')
  String get uploadSessionId;

  @BuiltValueField(wireName: r'status')
  MediaUploadBytesResponseStatusEnum get status;
  // enum statusEnum {  stored,  };

  MediaUploadBytesResponse._();

  factory MediaUploadBytesResponse([void updates(MediaUploadBytesResponseBuilder b)]) = _$MediaUploadBytesResponse;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(MediaUploadBytesResponseBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<MediaUploadBytesResponse> get serializer => _$MediaUploadBytesResponseSerializer();
}

class _$MediaUploadBytesResponseSerializer implements PrimitiveSerializer<MediaUploadBytesResponse> {
  @override
  final Iterable<Type> types = const [MediaUploadBytesResponse, _$MediaUploadBytesResponse];

  @override
  final String wireName = r'MediaUploadBytesResponse';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    MediaUploadBytesResponse object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    yield r'uploadSessionId';
    yield serializers.serialize(
      object.uploadSessionId,
      specifiedType: const FullType(String),
    );
    yield r'status';
    yield serializers.serialize(
      object.status,
      specifiedType: const FullType(MediaUploadBytesResponseStatusEnum),
    );
  }

  @override
  Object serialize(
    Serializers serializers,
    MediaUploadBytesResponse object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required MediaUploadBytesResponseBuilder result,
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
        case r'status':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(MediaUploadBytesResponseStatusEnum),
          ) as MediaUploadBytesResponseStatusEnum;
          result.status = valueDes;
          break;
        default:
          unhandled.add(key);
          unhandled.add(value);
          break;
      }
    }
  }

  @override
  MediaUploadBytesResponse deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = MediaUploadBytesResponseBuilder();
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

class MediaUploadBytesResponseStatusEnum extends EnumClass {

  @BuiltValueEnumConst(wireName: r'stored')
  static const MediaUploadBytesResponseStatusEnum stored = _$mediaUploadBytesResponseStatusEnum_stored;

  static Serializer<MediaUploadBytesResponseStatusEnum> get serializer => _$mediaUploadBytesResponseStatusEnumSerializer;

  const MediaUploadBytesResponseStatusEnum._(String name): super(name);

  static BuiltSet<MediaUploadBytesResponseStatusEnum> get values => _$mediaUploadBytesResponseStatusEnumValues;
  static MediaUploadBytesResponseStatusEnum valueOf(String name) => _$mediaUploadBytesResponseStatusEnumValueOf(name);
}
