//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:lythaus_api_client/src/model/media_upload_status_publication.dart';
import 'package:built_collection/built_collection.dart';
import 'package:lythaus_api_client/src/model/media_upload_status_safety.dart';
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'media_upload_status.g.dart';

/// MediaUploadStatus
///
/// Properties:
/// * [uploadSessionId]
/// * [status]
/// * [expiresAt]
/// * [processingComplete] - Integrity processing only; never a safety or authenticity decision.
/// * [safety]
/// * [authenticity]
/// * [publication]
/// * [private]
@BuiltValue()
abstract class MediaUploadStatus implements Built<MediaUploadStatus, MediaUploadStatusBuilder> {
  @BuiltValueField(wireName: r'uploadSessionId')
  String get uploadSessionId;

  @BuiltValueField(wireName: r'status')
  MediaUploadStatusStatusEnum get status;
  // enum statusEnum {  pending,  queued,  review,  rejected,  expired,  cancelled,  };

  @BuiltValueField(wireName: r'expiresAt')
  DateTime get expiresAt;

  /// Integrity processing only; never a safety or authenticity decision.
  @BuiltValueField(wireName: r'processingComplete')
  bool get processingComplete;

  @BuiltValueField(wireName: r'safety')
  MediaUploadStatusSafety get safety;

  @BuiltValueField(wireName: r'authenticity')
  MediaUploadStatusSafety get authenticity;

  @BuiltValueField(wireName: r'publication')
  MediaUploadStatusPublication get publication;

  @BuiltValueField(wireName: r'private')
  bool get private;

  MediaUploadStatus._();

  factory MediaUploadStatus([void updates(MediaUploadStatusBuilder b)]) = _$MediaUploadStatus;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(MediaUploadStatusBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<MediaUploadStatus> get serializer => _$MediaUploadStatusSerializer();
}

class _$MediaUploadStatusSerializer implements PrimitiveSerializer<MediaUploadStatus> {
  @override
  final Iterable<Type> types = const [MediaUploadStatus, _$MediaUploadStatus];

  @override
  final String wireName = r'MediaUploadStatus';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    MediaUploadStatus object, {
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
      specifiedType: const FullType(MediaUploadStatusStatusEnum),
    );
    yield r'expiresAt';
    yield serializers.serialize(
      object.expiresAt,
      specifiedType: const FullType(DateTime),
    );
    yield r'processingComplete';
    yield serializers.serialize(
      object.processingComplete,
      specifiedType: const FullType(bool),
    );
    yield r'safety';
    yield serializers.serialize(
      object.safety,
      specifiedType: const FullType(MediaUploadStatusSafety),
    );
    yield r'authenticity';
    yield serializers.serialize(
      object.authenticity,
      specifiedType: const FullType(MediaUploadStatusSafety),
    );
    yield r'publication';
    yield serializers.serialize(
      object.publication,
      specifiedType: const FullType(MediaUploadStatusPublication),
    );
    yield r'private';
    yield serializers.serialize(
      object.private,
      specifiedType: const FullType(bool),
    );
  }

  @override
  Object serialize(
    Serializers serializers,
    MediaUploadStatus object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required MediaUploadStatusBuilder result,
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
            specifiedType: const FullType(MediaUploadStatusStatusEnum),
          ) as MediaUploadStatusStatusEnum;
          result.status = valueDes;
          break;
        case r'expiresAt':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(DateTime),
          ) as DateTime;
          result.expiresAt = valueDes;
          break;
        case r'processingComplete':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(bool),
          ) as bool;
          result.processingComplete = valueDes;
          break;
        case r'safety':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(MediaUploadStatusSafety),
          ) as MediaUploadStatusSafety;
          result.safety.replace(valueDes);
          break;
        case r'authenticity':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(MediaUploadStatusSafety),
          ) as MediaUploadStatusSafety;
          result.authenticity.replace(valueDes);
          break;
        case r'publication':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(MediaUploadStatusPublication),
          ) as MediaUploadStatusPublication;
          result.publication.replace(valueDes);
          break;
        case r'private':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(bool),
          ) as bool;
          result.private = valueDes;
          break;
        default:
          unhandled.add(key);
          unhandled.add(value);
          break;
      }
    }
  }

  @override
  MediaUploadStatus deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = MediaUploadStatusBuilder();
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

class MediaUploadStatusStatusEnum extends EnumClass {

  @BuiltValueEnumConst(wireName: r'pending')
  static const MediaUploadStatusStatusEnum pending = _$mediaUploadStatusStatusEnum_pending;
  @BuiltValueEnumConst(wireName: r'queued')
  static const MediaUploadStatusStatusEnum queued = _$mediaUploadStatusStatusEnum_queued;
  @BuiltValueEnumConst(wireName: r'review')
  static const MediaUploadStatusStatusEnum review = _$mediaUploadStatusStatusEnum_review;
  @BuiltValueEnumConst(wireName: r'rejected')
  static const MediaUploadStatusStatusEnum rejected = _$mediaUploadStatusStatusEnum_rejected;
  @BuiltValueEnumConst(wireName: r'expired')
  static const MediaUploadStatusStatusEnum expired = _$mediaUploadStatusStatusEnum_expired;
  @BuiltValueEnumConst(wireName: r'cancelled')
  static const MediaUploadStatusStatusEnum cancelled = _$mediaUploadStatusStatusEnum_cancelled;

  static Serializer<MediaUploadStatusStatusEnum> get serializer => _$mediaUploadStatusStatusEnumSerializer;

  const MediaUploadStatusStatusEnum._(String name): super(name);

  static BuiltSet<MediaUploadStatusStatusEnum> get values => _$mediaUploadStatusStatusEnumValues;
  static MediaUploadStatusStatusEnum valueOf(String name) => _$mediaUploadStatusStatusEnumValueOf(name);
}
