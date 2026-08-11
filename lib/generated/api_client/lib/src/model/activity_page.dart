//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:built_collection/built_collection.dart';
import 'package:lythaus_api_client/src/model/activity_event.dart';
import 'package:lythaus_api_client/src/model/cursor_page.dart';
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'activity_page.g.dart';

/// ActivityPage
///
/// Properties:
/// * [nextCursor] - Opaque cursor for the next page, or null when exhausted.
/// * [items]
/// * [entries]
@BuiltValue()
abstract class ActivityPage implements CursorPage, Built<ActivityPage, ActivityPageBuilder> {
  @BuiltValueField(wireName: r'entries')
  BuiltList<ActivityEvent> get entries;

  @BuiltValueField(wireName: r'items')
  BuiltList<ActivityEvent> get items;

  ActivityPage._();

  factory ActivityPage([void updates(ActivityPageBuilder b)]) = _$ActivityPage;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(ActivityPageBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<ActivityPage> get serializer => _$ActivityPageSerializer();
}

class _$ActivityPageSerializer implements PrimitiveSerializer<ActivityPage> {
  @override
  final Iterable<Type> types = const [ActivityPage, _$ActivityPage];

  @override
  final String wireName = r'ActivityPage';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    ActivityPage object, {
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
      specifiedType: const FullType(BuiltList, [FullType(ActivityEvent)]),
    );
    yield r'entries';
    yield serializers.serialize(
      object.entries,
      specifiedType: const FullType(BuiltList, [FullType(ActivityEvent)]),
    );
  }

  @override
  Object serialize(
    Serializers serializers,
    ActivityPage object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required ActivityPageBuilder result,
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
            specifiedType: const FullType(BuiltList, [FullType(ActivityEvent)]),
          ) as BuiltList<ActivityEvent>;
          result.items.replace(valueDes);
          break;
        case r'entries':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(BuiltList, [FullType(ActivityEvent)]),
          ) as BuiltList<ActivityEvent>;
          result.entries.replace(valueDes);
          break;
        default:
          unhandled.add(key);
          unhandled.add(value);
          break;
      }
    }
  }

  @override
  ActivityPage deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = ActivityPageBuilder();
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
