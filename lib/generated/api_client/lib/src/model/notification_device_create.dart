//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:built_collection/built_collection.dart';
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'notification_device_create.g.dart';

/// NotificationDeviceCreate
///
/// Properties:
/// * [platform]
/// * [token]
@BuiltValue()
abstract class NotificationDeviceCreate implements Built<NotificationDeviceCreate, NotificationDeviceCreateBuilder> {
  @BuiltValueField(wireName: r'platform')
  NotificationDeviceCreatePlatformEnum get platform;
  // enum platformEnum {  android,  ios,  web,  };

  @BuiltValueField(wireName: r'token')
  String get token;

  NotificationDeviceCreate._();

  factory NotificationDeviceCreate([void updates(NotificationDeviceCreateBuilder b)]) = _$NotificationDeviceCreate;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(NotificationDeviceCreateBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<NotificationDeviceCreate> get serializer => _$NotificationDeviceCreateSerializer();
}

class _$NotificationDeviceCreateSerializer implements PrimitiveSerializer<NotificationDeviceCreate> {
  @override
  final Iterable<Type> types = const [NotificationDeviceCreate, _$NotificationDeviceCreate];

  @override
  final String wireName = r'NotificationDeviceCreate';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    NotificationDeviceCreate object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    yield r'platform';
    yield serializers.serialize(
      object.platform,
      specifiedType: const FullType(NotificationDeviceCreatePlatformEnum),
    );
    yield r'token';
    yield serializers.serialize(
      object.token,
      specifiedType: const FullType(String),
    );
  }

  @override
  Object serialize(
    Serializers serializers,
    NotificationDeviceCreate object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required NotificationDeviceCreateBuilder result,
    required List<Object?> unhandled,
  }) {
    for (var i = 0; i < serializedList.length; i += 2) {
      final key = serializedList[i] as String;
      final value = serializedList[i + 1];
      switch (key) {
        case r'platform':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(NotificationDeviceCreatePlatformEnum),
          ) as NotificationDeviceCreatePlatformEnum;
          result.platform = valueDes;
          break;
        case r'token':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.token = valueDes;
          break;
        default:
          unhandled.add(key);
          unhandled.add(value);
          break;
      }
    }
  }

  @override
  NotificationDeviceCreate deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = NotificationDeviceCreateBuilder();
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

class NotificationDeviceCreatePlatformEnum extends EnumClass {

  @BuiltValueEnumConst(wireName: r'android')
  static const NotificationDeviceCreatePlatformEnum android = _$notificationDeviceCreatePlatformEnum_android;
  @BuiltValueEnumConst(wireName: r'ios')
  static const NotificationDeviceCreatePlatformEnum ios = _$notificationDeviceCreatePlatformEnum_ios;
  @BuiltValueEnumConst(wireName: r'web')
  static const NotificationDeviceCreatePlatformEnum web = _$notificationDeviceCreatePlatformEnum_web;

  static Serializer<NotificationDeviceCreatePlatformEnum> get serializer => _$notificationDeviceCreatePlatformEnumSerializer;

  const NotificationDeviceCreatePlatformEnum._(String name): super(name);

  static BuiltSet<NotificationDeviceCreatePlatformEnum> get values => _$notificationDeviceCreatePlatformEnumValues;
  static NotificationDeviceCreatePlatformEnum valueOf(String name) => _$notificationDeviceCreatePlatformEnumValueOf(name);
}
