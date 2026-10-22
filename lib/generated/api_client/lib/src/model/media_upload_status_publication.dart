//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'media_upload_status_publication.g.dart';

/// MediaUploadStatusPublication
///
/// Properties:
/// * [allowed]
@BuiltValue()
abstract class MediaUploadStatusPublication implements Built<MediaUploadStatusPublication, MediaUploadStatusPublicationBuilder> {
  @BuiltValueField(wireName: r'allowed')
  bool get allowed;

  MediaUploadStatusPublication._();

  factory MediaUploadStatusPublication([void updates(MediaUploadStatusPublicationBuilder b)]) = _$MediaUploadStatusPublication;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(MediaUploadStatusPublicationBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<MediaUploadStatusPublication> get serializer => _$MediaUploadStatusPublicationSerializer();
}

class _$MediaUploadStatusPublicationSerializer implements PrimitiveSerializer<MediaUploadStatusPublication> {
  @override
  final Iterable<Type> types = const [MediaUploadStatusPublication, _$MediaUploadStatusPublication];

  @override
  final String wireName = r'MediaUploadStatusPublication';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    MediaUploadStatusPublication object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    yield r'allowed';
    yield serializers.serialize(
      object.allowed,
      specifiedType: const FullType(bool),
    );
  }

  @override
  Object serialize(
    Serializers serializers,
    MediaUploadStatusPublication object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required MediaUploadStatusPublicationBuilder result,
    required List<Object?> unhandled,
  }) {
    for (var i = 0; i < serializedList.length; i += 2) {
      final key = serializedList[i] as String;
      final value = serializedList[i + 1];
      switch (key) {
        case r'allowed':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(bool),
          ) as bool;
          result.allowed = valueDes;
          break;
        default:
          unhandled.add(key);
          unhandled.add(value);
          break;
      }
    }
  }

  @override
  MediaUploadStatusPublication deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = MediaUploadStatusPublicationBuilder();
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
