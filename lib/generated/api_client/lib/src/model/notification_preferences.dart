//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'notification_preferences.g.dart';

/// NotificationPreferences
///
/// Properties:
/// * [emailEnabled]
/// * [pushEnabled]
/// * [repliesEnabled]
/// * [moderationEnabled]
/// * [rewardsEnabled]
/// * [updatedAt]
@BuiltValue()
abstract class NotificationPreferences implements Built<NotificationPreferences, NotificationPreferencesBuilder> {
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

  @BuiltValueField(wireName: r'updatedAt')
  DateTime? get updatedAt;

  NotificationPreferences._();

  factory NotificationPreferences([void updates(NotificationPreferencesBuilder b)]) = _$NotificationPreferences;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(NotificationPreferencesBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<NotificationPreferences> get serializer => _$NotificationPreferencesSerializer();
}

class _$NotificationPreferencesSerializer implements PrimitiveSerializer<NotificationPreferences> {
  @override
  final Iterable<Type> types = const [NotificationPreferences, _$NotificationPreferences];

  @override
  final String wireName = r'NotificationPreferences';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    NotificationPreferences object, {
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
    if (object.updatedAt != null) {
      yield r'updatedAt';
      yield serializers.serialize(
        object.updatedAt,
        specifiedType: const FullType(DateTime),
      );
    }
  }

  @override
  Object serialize(
    Serializers serializers,
    NotificationPreferences object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required NotificationPreferencesBuilder result,
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
        case r'updatedAt':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(DateTime),
          ) as DateTime;
          result.updatedAt = valueDes;
          break;
        default:
          unhandled.add(key);
          unhandled.add(value);
          break;
      }
    }
  }

  @override
  NotificationPreferences deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = NotificationPreferencesBuilder();
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
