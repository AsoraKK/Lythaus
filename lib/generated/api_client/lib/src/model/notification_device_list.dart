//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:built_collection/built_collection.dart';
import 'package:built_value/json_object.dart';
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'notification_device_list.g.dart';

/// NotificationDeviceList
///
/// Properties:
/// * [items]
@BuiltValue()
abstract class NotificationDeviceList implements Built<NotificationDeviceList, NotificationDeviceListBuilder> {
  @BuiltValueField(wireName: r'items')
  BuiltList<BuiltMap<String, JsonObject?>> get items;

  NotificationDeviceList._();

  factory NotificationDeviceList([void updates(NotificationDeviceListBuilder b)]) = _$NotificationDeviceList;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(NotificationDeviceListBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<NotificationDeviceList> get serializer => _$NotificationDeviceListSerializer();
}

class _$NotificationDeviceListSerializer implements PrimitiveSerializer<NotificationDeviceList> {
  @override
  final Iterable<Type> types = const [NotificationDeviceList, _$NotificationDeviceList];

  @override
  final String wireName = r'NotificationDeviceList';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    NotificationDeviceList object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    yield r'items';
    yield serializers.serialize(
      object.items,
      specifiedType: const FullType(BuiltList, [FullType(BuiltMap, [FullType(String), FullType.nullable(JsonObject)])]),
    );
  }

  @override
  Object serialize(
    Serializers serializers,
    NotificationDeviceList object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required NotificationDeviceListBuilder result,
    required List<Object?> unhandled,
  }) {
    for (var i = 0; i < serializedList.length; i += 2) {
      final key = serializedList[i] as String;
      final value = serializedList[i + 1];
      switch (key) {
        case r'items':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(BuiltList, [FullType(BuiltMap, [FullType(String), FullType.nullable(JsonObject)])]),
          ) as BuiltList<BuiltMap<String, JsonObject?>>;
          result.items.replace(valueDes);
          break;
        default:
          unhandled.add(key);
          unhandled.add(value);
          break;
      }
    }
  }

  @override
  NotificationDeviceList deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = NotificationDeviceListBuilder();
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
