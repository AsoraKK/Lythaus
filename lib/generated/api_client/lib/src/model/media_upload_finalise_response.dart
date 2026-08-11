//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:built_collection/built_collection.dart';
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'media_upload_finalise_response.g.dart';

/// MediaUploadFinaliseResponse
///
/// Properties:
/// * [uploadSessionId]
/// * [status]
/// * [eventId]
@BuiltValue()
abstract class MediaUploadFinaliseResponse implements Built<MediaUploadFinaliseResponse, MediaUploadFinaliseResponseBuilder> {
  @BuiltValueField(wireName: r'uploadSessionId')
  String get uploadSessionId;

  @BuiltValueField(wireName: r'status')
  MediaUploadFinaliseResponseStatusEnum get status;
  // enum statusEnum {  queued,  };

  @BuiltValueField(wireName: r'eventId')
  String get eventId;

  MediaUploadFinaliseResponse._();

  factory MediaUploadFinaliseResponse([void updates(MediaUploadFinaliseResponseBuilder b)]) = _$MediaUploadFinaliseResponse;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(MediaUploadFinaliseResponseBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<MediaUploadFinaliseResponse> get serializer => _$MediaUploadFinaliseResponseSerializer();
}

class _$MediaUploadFinaliseResponseSerializer implements PrimitiveSerializer<MediaUploadFinaliseResponse> {
  @override
  final Iterable<Type> types = const [MediaUploadFinaliseResponse, _$MediaUploadFinaliseResponse];

  @override
  final String wireName = r'MediaUploadFinaliseResponse';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    MediaUploadFinaliseResponse object, {
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
      specifiedType: const FullType(MediaUploadFinaliseResponseStatusEnum),
    );
    yield r'eventId';
    yield serializers.serialize(
      object.eventId,
      specifiedType: const FullType(String),
    );
  }

  @override
  Object serialize(
    Serializers serializers,
    MediaUploadFinaliseResponse object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required MediaUploadFinaliseResponseBuilder result,
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
            specifiedType: const FullType(MediaUploadFinaliseResponseStatusEnum),
          ) as MediaUploadFinaliseResponseStatusEnum;
          result.status = valueDes;
          break;
        case r'eventId':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.eventId = valueDes;
          break;
        default:
          unhandled.add(key);
          unhandled.add(value);
          break;
      }
    }
  }

  @override
  MediaUploadFinaliseResponse deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = MediaUploadFinaliseResponseBuilder();
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

class MediaUploadFinaliseResponseStatusEnum extends EnumClass {

  @BuiltValueEnumConst(wireName: r'queued')
  static const MediaUploadFinaliseResponseStatusEnum queued = _$mediaUploadFinaliseResponseStatusEnum_queued;

  static Serializer<MediaUploadFinaliseResponseStatusEnum> get serializer => _$mediaUploadFinaliseResponseStatusEnumSerializer;

  const MediaUploadFinaliseResponseStatusEnum._(String name): super(name);

  static BuiltSet<MediaUploadFinaliseResponseStatusEnum> get values => _$mediaUploadFinaliseResponseStatusEnumValues;
  static MediaUploadFinaliseResponseStatusEnum valueOf(String name) => _$mediaUploadFinaliseResponseStatusEnumValueOf(name);
}
