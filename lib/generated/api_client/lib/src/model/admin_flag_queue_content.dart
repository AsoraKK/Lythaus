//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:lythaus_api_client/src/model/admin_content_type.dart';
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'admin_flag_queue_content.g.dart';

/// AdminFlagQueueContent
///
/// Properties:
/// * [contentId]
/// * [type]
/// * [createdAt]
/// * [preview]
@BuiltValue()
abstract class AdminFlagQueueContent implements Built<AdminFlagQueueContent, AdminFlagQueueContentBuilder> {
  @BuiltValueField(wireName: r'contentId')
  String? get contentId;

  @BuiltValueField(wireName: r'type')
  AdminContentType? get type;
  // enum typeEnum {  post,  comment,  user,  };

  @BuiltValueField(wireName: r'createdAt')
  DateTime? get createdAt;

  @BuiltValueField(wireName: r'preview')
  String? get preview;

  AdminFlagQueueContent._();

  factory AdminFlagQueueContent([void updates(AdminFlagQueueContentBuilder b)]) = _$AdminFlagQueueContent;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(AdminFlagQueueContentBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<AdminFlagQueueContent> get serializer => _$AdminFlagQueueContentSerializer();
}

class _$AdminFlagQueueContentSerializer implements PrimitiveSerializer<AdminFlagQueueContent> {
  @override
  final Iterable<Type> types = const [AdminFlagQueueContent, _$AdminFlagQueueContent];

  @override
  final String wireName = r'AdminFlagQueueContent';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    AdminFlagQueueContent object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    if (object.contentId != null) {
      yield r'contentId';
      yield serializers.serialize(
        object.contentId,
        specifiedType: const FullType(String),
      );
    }
    if (object.type != null) {
      yield r'type';
      yield serializers.serialize(
        object.type,
        specifiedType: const FullType(AdminContentType),
      );
    }
    if (object.createdAt != null) {
      yield r'createdAt';
      yield serializers.serialize(
        object.createdAt,
        specifiedType: const FullType(DateTime),
      );
    }
    if (object.preview != null) {
      yield r'preview';
      yield serializers.serialize(
        object.preview,
        specifiedType: const FullType(String),
      );
    }
  }

  @override
  Object serialize(
    Serializers serializers,
    AdminFlagQueueContent object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required AdminFlagQueueContentBuilder result,
    required List<Object?> unhandled,
  }) {
    for (var i = 0; i < serializedList.length; i += 2) {
      final key = serializedList[i] as String;
      final value = serializedList[i + 1];
      switch (key) {
        case r'contentId':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.contentId = valueDes;
          break;
        case r'type':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(AdminContentType),
          ) as AdminContentType;
          result.type = valueDes;
          break;
        case r'createdAt':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(DateTime),
          ) as DateTime;
          result.createdAt = valueDes;
          break;
        case r'preview':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.preview = valueDes;
          break;
        default:
          unhandled.add(key);
          unhandled.add(value);
          break;
      }
    }
  }

  @override
  AdminFlagQueueContent deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = AdminFlagQueueContentBuilder();
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
