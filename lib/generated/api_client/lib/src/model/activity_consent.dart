//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:built_collection/built_collection.dart';
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'activity_consent.g.dart';

/// ActivityConsent
///
/// Properties:
/// * [pilotEnabled]
/// * [granted]
/// * [revision]
/// * [epoch]
/// * [continuousSince]
/// * [accountScope]
/// * [noticeVersion]
/// * [notice] - Exact versioned account-linked purpose and retention notice from the shared contract; clients reject notice drift.
/// * [retentionDays]
@BuiltValue()
abstract class ActivityConsent implements Built<ActivityConsent, ActivityConsentBuilder> {
  @BuiltValueField(wireName: r'pilotEnabled')
  bool get pilotEnabled;

  @BuiltValueField(wireName: r'granted')
  bool get granted;

  @BuiltValueField(wireName: r'revision')
  int get revision;

  @BuiltValueField(wireName: r'epoch')
  String? get epoch;

  @BuiltValueField(wireName: r'continuousSince')
  DateTime? get continuousSince;

  @BuiltValueField(wireName: r'accountScope')
  String get accountScope;

  @BuiltValueField(wireName: r'noticeVersion')
  ActivityConsentNoticeVersionEnum get noticeVersion;
  // enum noticeVersionEnum {  activity-account-day-v1,  };

  /// Exact versioned account-linked purpose and retention notice from the shared contract; clients reject notice drift.
  @BuiltValueField(wireName: r'notice')
  String get notice;

  @BuiltValueField(wireName: r'retentionDays')
  ActivityConsentRetentionDaysEnum get retentionDays;
  // enum retentionDaysEnum {  61,  };

  ActivityConsent._();

  factory ActivityConsent([void updates(ActivityConsentBuilder b)]) = _$ActivityConsent;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(ActivityConsentBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<ActivityConsent> get serializer => _$ActivityConsentSerializer();
}

class _$ActivityConsentSerializer implements PrimitiveSerializer<ActivityConsent> {
  @override
  final Iterable<Type> types = const [ActivityConsent, _$ActivityConsent];

  @override
  final String wireName = r'ActivityConsent';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    ActivityConsent object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    yield r'pilotEnabled';
    yield serializers.serialize(
      object.pilotEnabled,
      specifiedType: const FullType(bool),
    );
    yield r'granted';
    yield serializers.serialize(
      object.granted,
      specifiedType: const FullType(bool),
    );
    yield r'revision';
    yield serializers.serialize(
      object.revision,
      specifiedType: const FullType(int),
    );
    yield r'epoch';
    yield object.epoch == null ? null : serializers.serialize(
      object.epoch,
      specifiedType: const FullType.nullable(String),
    );
    yield r'continuousSince';
    yield object.continuousSince == null ? null : serializers.serialize(
      object.continuousSince,
      specifiedType: const FullType.nullable(DateTime),
    );
    yield r'accountScope';
    yield serializers.serialize(
      object.accountScope,
      specifiedType: const FullType(String),
    );
    yield r'noticeVersion';
    yield serializers.serialize(
      object.noticeVersion,
      specifiedType: const FullType(ActivityConsentNoticeVersionEnum),
    );
    yield r'notice';
    yield serializers.serialize(
      object.notice,
      specifiedType: const FullType(String),
    );
    yield r'retentionDays';
    yield serializers.serialize(
      object.retentionDays,
      specifiedType: const FullType(ActivityConsentRetentionDaysEnum),
    );
  }

  @override
  Object serialize(
    Serializers serializers,
    ActivityConsent object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required ActivityConsentBuilder result,
    required List<Object?> unhandled,
  }) {
    for (var i = 0; i < serializedList.length; i += 2) {
      final key = serializedList[i] as String;
      final value = serializedList[i + 1];
      switch (key) {
        case r'pilotEnabled':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(bool),
          ) as bool;
          result.pilotEnabled = valueDes;
          break;
        case r'granted':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(bool),
          ) as bool;
          result.granted = valueDes;
          break;
        case r'revision':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(int),
          ) as int;
          result.revision = valueDes;
          break;
        case r'epoch':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType.nullable(String),
          ) as String?;
          if (valueDes == null) continue;
          result.epoch = valueDes;
          break;
        case r'continuousSince':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType.nullable(DateTime),
          ) as DateTime?;
          if (valueDes == null) continue;
          result.continuousSince = valueDes;
          break;
        case r'accountScope':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.accountScope = valueDes;
          break;
        case r'noticeVersion':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(ActivityConsentNoticeVersionEnum),
          ) as ActivityConsentNoticeVersionEnum;
          result.noticeVersion = valueDes;
          break;
        case r'notice':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.notice = valueDes;
          break;
        case r'retentionDays':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(ActivityConsentRetentionDaysEnum),
          ) as ActivityConsentRetentionDaysEnum;
          result.retentionDays = valueDes;
          break;
        default:
          unhandled.add(key);
          unhandled.add(value);
          break;
      }
    }
  }

  @override
  ActivityConsent deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = ActivityConsentBuilder();
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

class ActivityConsentNoticeVersionEnum extends EnumClass {

  @BuiltValueEnumConst(wireName: r'activity-account-day-v1')
  static const ActivityConsentNoticeVersionEnum activityAccountDayV1 = _$activityConsentNoticeVersionEnum_activityAccountDayV1;

  static Serializer<ActivityConsentNoticeVersionEnum> get serializer => _$activityConsentNoticeVersionEnumSerializer;

  const ActivityConsentNoticeVersionEnum._(String name): super(name);

  static BuiltSet<ActivityConsentNoticeVersionEnum> get values => _$activityConsentNoticeVersionEnumValues;
  static ActivityConsentNoticeVersionEnum valueOf(String name) => _$activityConsentNoticeVersionEnumValueOf(name);
}

class ActivityConsentRetentionDaysEnum extends EnumClass {

  @BuiltValueEnumConst(wireNumber: 61)
  static const ActivityConsentRetentionDaysEnum number61 = _$activityConsentRetentionDaysEnum_number61;

  static Serializer<ActivityConsentRetentionDaysEnum> get serializer => _$activityConsentRetentionDaysEnumSerializer;

  const ActivityConsentRetentionDaysEnum._(String name): super(name);

  static BuiltSet<ActivityConsentRetentionDaysEnum> get values => _$activityConsentRetentionDaysEnumValues;
  static ActivityConsentRetentionDaysEnum valueOf(String name) => _$activityConsentRetentionDaysEnumValueOf(name);
}
