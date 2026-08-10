//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:built_collection/built_collection.dart';
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'notification_device_created.g.dart';

/// NotificationDeviceCreated
///
/// Properties:
/// * [id]
/// * [platform]
@BuiltValue()
abstract class NotificationDeviceCreated implements Built<NotificationDeviceCreated, NotificationDeviceCreatedBuilder> {
  @BuiltValueField(wireName: r'id')
  String get id;

  @BuiltValueField(wireName: r'platform')
  NotificationDeviceCreatedPlatformEnum get platform;
  // enum platformEnum {  android,  ios,  web,  };

  NotificationDeviceCreated._();

  factory NotificationDeviceCreated([void updates(NotificationDeviceCreatedBuilder b)]) = _$NotificationDeviceCreated;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(NotificationDeviceCreatedBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<NotificationDeviceCreated> get serializer => _$NotificationDeviceCreatedSerializer();
}

class _$NotificationDeviceCreatedSerializer implements PrimitiveSerializer<NotificationDeviceCreated> {
  @override
  final Iterable<Type> types = const [NotificationDeviceCreated, _$NotificationDeviceCreated];

  @override
  final String wireName = r'NotificationDeviceCreated';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    NotificationDeviceCreated object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    yield r'id';
    yield serializers.serialize(
      object.id,
      specifiedType: const FullType(String),
    );
    yield r'platform';
    yield serializers.serialize(
      object.platform,
      specifiedType: const FullType(NotificationDeviceCreatedPlatformEnum),
    );
  }

  @override
  Object serialize(
    Serializers serializers,
    NotificationDeviceCreated object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required NotificationDeviceCreatedBuilder result,
    required List<Object?> unhandled,
  }) {
    for (var i = 0; i < serializedList.length; i += 2) {
      final key = serializedList[i] as String;
      final value = serializedList[i + 1];
      switch (key) {
        case r'id':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.id = valueDes;
          break;
        case r'platform':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(NotificationDeviceCreatedPlatformEnum),
          ) as NotificationDeviceCreatedPlatformEnum;
          result.platform = valueDes;
          break;
        default:
          unhandled.add(key);
          unhandled.add(value);
          break;
      }
    }
  }

  @override
  NotificationDeviceCreated deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = NotificationDeviceCreatedBuilder();
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

class NotificationDeviceCreatedPlatformEnum extends EnumClass {

  @BuiltValueEnumConst(wireName: r'android')
  static const NotificationDeviceCreatedPlatformEnum android = _$notificationDeviceCreatedPlatformEnum_android;
  @BuiltValueEnumConst(wireName: r'ios')
  static const NotificationDeviceCreatedPlatformEnum ios = _$notificationDeviceCreatedPlatformEnum_ios;
  @BuiltValueEnumConst(wireName: r'web')
  static const NotificationDeviceCreatedPlatformEnum web = _$notificationDeviceCreatedPlatformEnum_web;

  static Serializer<NotificationDeviceCreatedPlatformEnum> get serializer => _$notificationDeviceCreatedPlatformEnumSerializer;

  const NotificationDeviceCreatedPlatformEnum._(String name): super(name);

  static BuiltSet<NotificationDeviceCreatedPlatformEnum> get values => _$notificationDeviceCreatedPlatformEnumValues;
  static NotificationDeviceCreatedPlatformEnum valueOf(String name) => _$notificationDeviceCreatedPlatformEnumValueOf(name);
}
