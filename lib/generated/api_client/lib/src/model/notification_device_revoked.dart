//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'notification_device_revoked.g.dart';

/// NotificationDeviceRevoked
///
/// Properties:
/// * [id]
/// * [revoked]
@BuiltValue()
abstract class NotificationDeviceRevoked implements Built<NotificationDeviceRevoked, NotificationDeviceRevokedBuilder> {
  @BuiltValueField(wireName: r'id')
  String get id;

  @BuiltValueField(wireName: r'revoked')
  bool get revoked;

  NotificationDeviceRevoked._();

  factory NotificationDeviceRevoked([void updates(NotificationDeviceRevokedBuilder b)]) = _$NotificationDeviceRevoked;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(NotificationDeviceRevokedBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<NotificationDeviceRevoked> get serializer => _$NotificationDeviceRevokedSerializer();
}

class _$NotificationDeviceRevokedSerializer implements PrimitiveSerializer<NotificationDeviceRevoked> {
  @override
  final Iterable<Type> types = const [NotificationDeviceRevoked, _$NotificationDeviceRevoked];

  @override
  final String wireName = r'NotificationDeviceRevoked';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    NotificationDeviceRevoked object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    yield r'id';
    yield serializers.serialize(
      object.id,
      specifiedType: const FullType(String),
    );
    yield r'revoked';
    yield serializers.serialize(
      object.revoked,
      specifiedType: const FullType(bool),
    );
  }

  @override
  Object serialize(
    Serializers serializers,
    NotificationDeviceRevoked object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required NotificationDeviceRevokedBuilder result,
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
        case r'revoked':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(bool),
          ) as bool;
          result.revoked = valueDes;
          break;
        default:
          unhandled.add(key);
          unhandled.add(value);
          break;
      }
    }
  }

  @override
  NotificationDeviceRevoked deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = NotificationDeviceRevokedBuilder();
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
