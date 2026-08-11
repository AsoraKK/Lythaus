//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:built_collection/built_collection.dart';
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'notification_action_response.g.dart';

/// NotificationActionResponse
///
/// Properties:
/// * [id]
/// * [action]
@BuiltValue()
abstract class NotificationActionResponse implements Built<NotificationActionResponse, NotificationActionResponseBuilder> {
  @BuiltValueField(wireName: r'id')
  String get id;

  @BuiltValueField(wireName: r'action')
  NotificationActionResponseActionEnum get action;
  // enum actionEnum {  read,  dismiss,  };

  NotificationActionResponse._();

  factory NotificationActionResponse([void updates(NotificationActionResponseBuilder b)]) = _$NotificationActionResponse;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(NotificationActionResponseBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<NotificationActionResponse> get serializer => _$NotificationActionResponseSerializer();
}

class _$NotificationActionResponseSerializer implements PrimitiveSerializer<NotificationActionResponse> {
  @override
  final Iterable<Type> types = const [NotificationActionResponse, _$NotificationActionResponse];

  @override
  final String wireName = r'NotificationActionResponse';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    NotificationActionResponse object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    yield r'id';
    yield serializers.serialize(
      object.id,
      specifiedType: const FullType(String),
    );
    yield r'action';
    yield serializers.serialize(
      object.action,
      specifiedType: const FullType(NotificationActionResponseActionEnum),
    );
  }

  @override
  Object serialize(
    Serializers serializers,
    NotificationActionResponse object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required NotificationActionResponseBuilder result,
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
        case r'action':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(NotificationActionResponseActionEnum),
          ) as NotificationActionResponseActionEnum;
          result.action = valueDes;
          break;
        default:
          unhandled.add(key);
          unhandled.add(value);
          break;
      }
    }
  }

  @override
  NotificationActionResponse deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = NotificationActionResponseBuilder();
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

class NotificationActionResponseActionEnum extends EnumClass {

  @BuiltValueEnumConst(wireName: r'read')
  static const NotificationActionResponseActionEnum read = _$notificationActionResponseActionEnum_read;
  @BuiltValueEnumConst(wireName: r'dismiss')
  static const NotificationActionResponseActionEnum dismiss = _$notificationActionResponseActionEnum_dismiss;

  static Serializer<NotificationActionResponseActionEnum> get serializer => _$notificationActionResponseActionEnumSerializer;

  const NotificationActionResponseActionEnum._(String name): super(name);

  static BuiltSet<NotificationActionResponseActionEnum> get values => _$notificationActionResponseActionEnumValues;
  static NotificationActionResponseActionEnum valueOf(String name) => _$notificationActionResponseActionEnumValueOf(name);
}
