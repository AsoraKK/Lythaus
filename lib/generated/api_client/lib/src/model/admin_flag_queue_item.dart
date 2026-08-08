//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:lythaus_api_client/src/model/admin_moderation_summary.dart';
import 'package:lythaus_api_client/src/model/admin_flag_queue_content.dart';
import 'package:lythaus_api_client/src/model/admin_content_state.dart';
import 'package:lythaus_api_client/src/model/admin_flag_queue_author.dart';
import 'package:lythaus_api_client/src/model/admin_flag_queue_flags.dart';
import 'package:lythaus_api_client/src/model/admin_queue_status.dart';
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'admin_flag_queue_item.g.dart';

/// AdminFlagQueueItem
///
/// Properties:
/// * [content]
/// * [author]
/// * [flags]
/// * [state]
/// * [moderation]
/// * [status]
@BuiltValue()
abstract class AdminFlagQueueItem implements Built<AdminFlagQueueItem, AdminFlagQueueItemBuilder> {
  @BuiltValueField(wireName: r'content')
  AdminFlagQueueContent get content;

  @BuiltValueField(wireName: r'author')
  AdminFlagQueueAuthor get author;

  @BuiltValueField(wireName: r'flags')
  AdminFlagQueueFlags get flags;

  @BuiltValueField(wireName: r'state')
  AdminContentState get state;
  // enum stateEnum {  PUBLISHED,  BLOCKED,  };

  @BuiltValueField(wireName: r'moderation')
  AdminModerationSummary? get moderation;

  @BuiltValueField(wireName: r'status')
  AdminQueueStatus get status;
  // enum statusEnum {  OPEN,  RESOLVED,  };

  AdminFlagQueueItem._();

  factory AdminFlagQueueItem([void updates(AdminFlagQueueItemBuilder b)]) = _$AdminFlagQueueItem;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(AdminFlagQueueItemBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<AdminFlagQueueItem> get serializer => _$AdminFlagQueueItemSerializer();
}

class _$AdminFlagQueueItemSerializer implements PrimitiveSerializer<AdminFlagQueueItem> {
  @override
  final Iterable<Type> types = const [AdminFlagQueueItem, _$AdminFlagQueueItem];

  @override
  final String wireName = r'AdminFlagQueueItem';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    AdminFlagQueueItem object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    yield r'content';
    yield serializers.serialize(
      object.content,
      specifiedType: const FullType(AdminFlagQueueContent),
    );
    yield r'author';
    yield serializers.serialize(
      object.author,
      specifiedType: const FullType(AdminFlagQueueAuthor),
    );
    yield r'flags';
    yield serializers.serialize(
      object.flags,
      specifiedType: const FullType(AdminFlagQueueFlags),
    );
    yield r'state';
    yield serializers.serialize(
      object.state,
      specifiedType: const FullType(AdminContentState),
    );
    if (object.moderation != null) {
      yield r'moderation';
      yield serializers.serialize(
        object.moderation,
        specifiedType: const FullType(AdminModerationSummary),
      );
    }
    yield r'status';
    yield serializers.serialize(
      object.status,
      specifiedType: const FullType(AdminQueueStatus),
    );
  }

  @override
  Object serialize(
    Serializers serializers,
    AdminFlagQueueItem object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required AdminFlagQueueItemBuilder result,
    required List<Object?> unhandled,
  }) {
    for (var i = 0; i < serializedList.length; i += 2) {
      final key = serializedList[i] as String;
      final value = serializedList[i + 1];
      switch (key) {
        case r'content':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(AdminFlagQueueContent),
          ) as AdminFlagQueueContent;
          result.content.replace(valueDes);
          break;
        case r'author':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(AdminFlagQueueAuthor),
          ) as AdminFlagQueueAuthor;
          result.author.replace(valueDes);
          break;
        case r'flags':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(AdminFlagQueueFlags),
          ) as AdminFlagQueueFlags;
          result.flags.replace(valueDes);
          break;
        case r'state':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(AdminContentState),
          ) as AdminContentState;
          result.state = valueDes;
          break;
        case r'moderation':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(AdminModerationSummary),
          ) as AdminModerationSummary;
          result.moderation.replace(valueDes);
          break;
        case r'status':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(AdminQueueStatus),
          ) as AdminQueueStatus;
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
  AdminFlagQueueItem deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = AdminFlagQueueItemBuilder();
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
