//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:built_collection/built_collection.dart';
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'media_upload_status_safety.g.dart';

/// MediaUploadStatusSafety
///
/// Properties:
/// * [status]
@BuiltValue()
abstract class MediaUploadStatusSafety implements Built<MediaUploadStatusSafety, MediaUploadStatusSafetyBuilder> {
  @BuiltValueField(wireName: r'status')
  MediaUploadStatusSafetyStatusEnum get status;
  // enum statusEnum {  not_run,  };

  MediaUploadStatusSafety._();

  factory MediaUploadStatusSafety([void updates(MediaUploadStatusSafetyBuilder b)]) = _$MediaUploadStatusSafety;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(MediaUploadStatusSafetyBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<MediaUploadStatusSafety> get serializer => _$MediaUploadStatusSafetySerializer();
}

class _$MediaUploadStatusSafetySerializer implements PrimitiveSerializer<MediaUploadStatusSafety> {
  @override
  final Iterable<Type> types = const [MediaUploadStatusSafety, _$MediaUploadStatusSafety];

  @override
  final String wireName = r'MediaUploadStatusSafety';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    MediaUploadStatusSafety object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    yield r'status';
    yield serializers.serialize(
      object.status,
      specifiedType: const FullType(MediaUploadStatusSafetyStatusEnum),
    );
  }

  @override
  Object serialize(
    Serializers serializers,
    MediaUploadStatusSafety object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required MediaUploadStatusSafetyBuilder result,
    required List<Object?> unhandled,
  }) {
    for (var i = 0; i < serializedList.length; i += 2) {
      final key = serializedList[i] as String;
      final value = serializedList[i + 1];
      switch (key) {
        case r'status':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(MediaUploadStatusSafetyStatusEnum),
          ) as MediaUploadStatusSafetyStatusEnum;
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
  MediaUploadStatusSafety deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = MediaUploadStatusSafetyBuilder();
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

class MediaUploadStatusSafetyStatusEnum extends EnumClass {

  @BuiltValueEnumConst(wireName: r'not_run')
  static const MediaUploadStatusSafetyStatusEnum notRun = _$mediaUploadStatusSafetyStatusEnum_notRun;

  static Serializer<MediaUploadStatusSafetyStatusEnum> get serializer => _$mediaUploadStatusSafetyStatusEnumSerializer;

  const MediaUploadStatusSafetyStatusEnum._(String name): super(name);

  static BuiltSet<MediaUploadStatusSafetyStatusEnum> get values => _$mediaUploadStatusSafetyStatusEnumValues;
  static MediaUploadStatusSafetyStatusEnum valueOf(String name) => _$mediaUploadStatusSafetyStatusEnumValueOf(name);
}
