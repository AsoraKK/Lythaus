//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'notification_preference_update.g.dart';

/// NotificationPreferenceUpdate
///
/// Properties:
/// * [emailEnabled]
/// * [pushEnabled]
/// * [repliesEnabled]
/// * [moderationEnabled]
/// * [rewardsEnabled]
@BuiltValue()
abstract class NotificationPreferenceUpdate implements Built<NotificationPreferenceUpdate, NotificationPreferenceUpdateBuilder> {
  @BuiltValueField(wireName: r'emailEnabled')
  bool? get emailEnabled;

  @BuiltValueField(wireName: r'pushEnabled')
  bool? get pushEnabled;

  @BuiltValueField(wireName: r'repliesEnabled')
  bool? get repliesEnabled;

  @BuiltValueField(wireName: r'moderationEnabled')
  bool? get moderationEnabled;

  @BuiltValueField(wireName: r'rewardsEnabled')
  bool? get rewardsEnabled;

  NotificationPreferenceUpdate._();

  factory NotificationPreferenceUpdate([void updates(NotificationPreferenceUpdateBuilder b)]) = _$NotificationPreferenceUpdate;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(NotificationPreferenceUpdateBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<NotificationPreferenceUpdate> get serializer => _$NotificationPreferenceUpdateSerializer();
}

class _$NotificationPreferenceUpdateSerializer implements PrimitiveSerializer<NotificationPreferenceUpdate> {
  @override
  final Iterable<Type> types = const [NotificationPreferenceUpdate, _$NotificationPreferenceUpdate];

  @override
  final String wireName = r'NotificationPreferenceUpdate';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    NotificationPreferenceUpdate object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    if (object.emailEnabled != null) {
      yield r'emailEnabled';
      yield serializers.serialize(
        object.emailEnabled,
        specifiedType: const FullType(bool),
      );
    }
    if (object.pushEnabled != null) {
      yield r'pushEnabled';
      yield serializers.serialize(
        object.pushEnabled,
        specifiedType: const FullType(bool),
      );
    }
    if (object.repliesEnabled != null) {
      yield r'repliesEnabled';
      yield serializers.serialize(
        object.repliesEnabled,
        specifiedType: const FullType(bool),
      );
    }
    if (object.moderationEnabled != null) {
      yield r'moderationEnabled';
      yield serializers.serialize(
        object.moderationEnabled,
        specifiedType: const FullType(bool),
      );
    }
    if (object.rewardsEnabled != null) {
      yield r'rewardsEnabled';
      yield serializers.serialize(
        object.rewardsEnabled,
        specifiedType: const FullType(bool),
      );
    }
  }

  @override
  Object serialize(
    Serializers serializers,
    NotificationPreferenceUpdate object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required NotificationPreferenceUpdateBuilder result,
    required List<Object?> unhandled,
  }) {
    for (var i = 0; i < serializedList.length; i += 2) {
      final key = serializedList[i] as String;
      final value = serializedList[i + 1];
      switch (key) {
        case r'emailEnabled':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(bool),
          ) as bool;
          result.emailEnabled = valueDes;
          break;
        case r'pushEnabled':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(bool),
          ) as bool;
          result.pushEnabled = valueDes;
          break;
        case r'repliesEnabled':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(bool),
          ) as bool;
          result.repliesEnabled = valueDes;
          break;
        case r'moderationEnabled':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(bool),
          ) as bool;
          result.moderationEnabled = valueDes;
          break;
        case r'rewardsEnabled':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(bool),
          ) as bool;
          result.rewardsEnabled = valueDes;
          break;
        default:
          unhandled.add(key);
          unhandled.add(value);
          break;
      }
    }
  }

  @override
  NotificationPreferenceUpdate deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = NotificationPreferenceUpdateBuilder();
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
