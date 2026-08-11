//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:built_collection/built_collection.dart';
import 'package:lythaus_api_client/src/model/notification.dart';
import 'package:lythaus_api_client/src/model/cursor_page.dart';
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'notification_page.g.dart';

/// NotificationPage
///
/// Properties:
/// * [nextCursor] - Opaque cursor for the next page, or null when exhausted.
/// * [items]
/// * [notifications]
/// * [continuationToken]
/// * [totalUnread]
@BuiltValue()
abstract class NotificationPage implements CursorPage, Built<NotificationPage, NotificationPageBuilder> {
  @BuiltValueField(wireName: r'items')
  BuiltList<Notification> get items;

  @BuiltValueField(wireName: r'notifications')
  BuiltList<Notification> get notifications;

  @BuiltValueField(wireName: r'totalUnread')
  int get totalUnread;

  @BuiltValueField(wireName: r'continuationToken')
  String? get continuationToken;

  NotificationPage._();

  factory NotificationPage([void updates(NotificationPageBuilder b)]) = _$NotificationPage;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(NotificationPageBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<NotificationPage> get serializer => _$NotificationPageSerializer();
}

class _$NotificationPageSerializer implements PrimitiveSerializer<NotificationPage> {
  @override
  final Iterable<Type> types = const [NotificationPage, _$NotificationPage];

  @override
  final String wireName = r'NotificationPage';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    NotificationPage object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    yield r'nextCursor';
    yield object.nextCursor == null ? null : serializers.serialize(
      object.nextCursor,
      specifiedType: const FullType.nullable(String),
    );
    yield r'items';
    yield serializers.serialize(
      object.items,
      specifiedType: const FullType(BuiltList, [FullType(Notification)]),
    );
    yield r'notifications';
    yield serializers.serialize(
      object.notifications,
      specifiedType: const FullType(BuiltList, [FullType(Notification)]),
    );
    yield r'totalUnread';
    yield serializers.serialize(
      object.totalUnread,
      specifiedType: const FullType(int),
    );
    yield r'continuationToken';
    yield object.continuationToken == null ? null : serializers.serialize(
      object.continuationToken,
      specifiedType: const FullType.nullable(String),
    );
  }

  @override
  Object serialize(
    Serializers serializers,
    NotificationPage object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required NotificationPageBuilder result,
    required List<Object?> unhandled,
  }) {
    for (var i = 0; i < serializedList.length; i += 2) {
      final key = serializedList[i] as String;
      final value = serializedList[i + 1];
      switch (key) {
        case r'nextCursor':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType.nullable(String),
          ) as String?;
          if (valueDes == null) continue;
          result.nextCursor = valueDes;
          break;
        case r'items':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(BuiltList, [FullType(Notification)]),
          ) as BuiltList<Notification>;
          result.items.replace(valueDes);
          break;
        case r'notifications':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(BuiltList, [FullType(Notification)]),
          ) as BuiltList<Notification>;
          result.notifications.replace(valueDes);
          break;
        case r'totalUnread':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(int),
          ) as int;
          result.totalUnread = valueDes;
          break;
        case r'continuationToken':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType.nullable(String),
          ) as String?;
          if (valueDes == null) continue;
          result.continuationToken = valueDes;
          break;
        default:
          unhandled.add(key);
          unhandled.add(value);
          break;
      }
    }
  }

  @override
  NotificationPage deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = NotificationPageBuilder();
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
