//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:lythaus_api_client/src/model/activity_summary_metrics.dart';
import 'package:built_collection/built_collection.dart';
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'activity_summary.g.dart';

/// ActivitySummary
///
/// Properties:
/// * [contractVersion]
/// * [enabled]
/// * [sampledAt]
/// * [timezone]
/// * [source_]
/// * [population]
/// * [windowBasis]
/// * [retentionDays]
/// * [accountLimit]
/// * [metrics]
@BuiltValue()
abstract class ActivitySummary implements Built<ActivitySummary, ActivitySummaryBuilder> {
  @BuiltValueField(wireName: r'contractVersion')
  ActivitySummaryContractVersionEnum get contractVersion;
  // enum contractVersionEnum {  activity-pilot-v1,  };

  @BuiltValueField(wireName: r'enabled')
  bool get enabled;

  @BuiltValueField(wireName: r'sampledAt')
  DateTime get sampledAt;

  @BuiltValueField(wireName: r'timezone')
  ActivitySummaryTimezoneEnum get timezone;
  // enum timezoneEnum {  UTC,  };

  @BuiltValueField(wireName: r'source')
  ActivitySummarySource_Enum get source_;
  // enum source_Enum {  privacy.account_active_days,  };

  @BuiltValueField(wireName: r'population')
  String get population;

  @BuiltValueField(wireName: r'windowBasis')
  ActivitySummaryWindowBasisEnum get windowBasis;
  // enum windowBasisEnum {  completed_utc_days,  };

  @BuiltValueField(wireName: r'retentionDays')
  ActivitySummaryRetentionDaysEnum get retentionDays;
  // enum retentionDaysEnum {  61,  };

  @BuiltValueField(wireName: r'accountLimit')
  ActivitySummaryAccountLimitEnum get accountLimit;
  // enum accountLimitEnum {  5000,  };

  @BuiltValueField(wireName: r'metrics')
  ActivitySummaryMetrics get metrics;

  ActivitySummary._();

  factory ActivitySummary([void updates(ActivitySummaryBuilder b)]) = _$ActivitySummary;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(ActivitySummaryBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<ActivitySummary> get serializer => _$ActivitySummarySerializer();
}

class _$ActivitySummarySerializer implements PrimitiveSerializer<ActivitySummary> {
  @override
  final Iterable<Type> types = const [ActivitySummary, _$ActivitySummary];

  @override
  final String wireName = r'ActivitySummary';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    ActivitySummary object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    yield r'contractVersion';
    yield serializers.serialize(
      object.contractVersion,
      specifiedType: const FullType(ActivitySummaryContractVersionEnum),
    );
    yield r'enabled';
    yield serializers.serialize(
      object.enabled,
      specifiedType: const FullType(bool),
    );
    yield r'sampledAt';
    yield serializers.serialize(
      object.sampledAt,
      specifiedType: const FullType(DateTime),
    );
    yield r'timezone';
    yield serializers.serialize(
      object.timezone,
      specifiedType: const FullType(ActivitySummaryTimezoneEnum),
    );
    yield r'source';
    yield serializers.serialize(
      object.source_,
      specifiedType: const FullType(ActivitySummarySource_Enum),
    );
    yield r'population';
    yield serializers.serialize(
      object.population,
      specifiedType: const FullType(String),
    );
    yield r'windowBasis';
    yield serializers.serialize(
      object.windowBasis,
      specifiedType: const FullType(ActivitySummaryWindowBasisEnum),
    );
    yield r'retentionDays';
    yield serializers.serialize(
      object.retentionDays,
      specifiedType: const FullType(ActivitySummaryRetentionDaysEnum),
    );
    yield r'accountLimit';
    yield serializers.serialize(
      object.accountLimit,
      specifiedType: const FullType(ActivitySummaryAccountLimitEnum),
    );
    yield r'metrics';
    yield serializers.serialize(
      object.metrics,
      specifiedType: const FullType(ActivitySummaryMetrics),
    );
  }

  @override
  Object serialize(
    Serializers serializers,
    ActivitySummary object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required ActivitySummaryBuilder result,
    required List<Object?> unhandled,
  }) {
    for (var i = 0; i < serializedList.length; i += 2) {
      final key = serializedList[i] as String;
      final value = serializedList[i + 1];
      switch (key) {
        case r'contractVersion':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(ActivitySummaryContractVersionEnum),
          ) as ActivitySummaryContractVersionEnum;
          result.contractVersion = valueDes;
          break;
        case r'enabled':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(bool),
          ) as bool;
          result.enabled = valueDes;
          break;
        case r'sampledAt':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(DateTime),
          ) as DateTime;
          result.sampledAt = valueDes;
          break;
        case r'timezone':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(ActivitySummaryTimezoneEnum),
          ) as ActivitySummaryTimezoneEnum;
          result.timezone = valueDes;
          break;
        case r'source':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(ActivitySummarySource_Enum),
          ) as ActivitySummarySource_Enum;
          result.source_ = valueDes;
          break;
        case r'population':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.population = valueDes;
          break;
        case r'windowBasis':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(ActivitySummaryWindowBasisEnum),
          ) as ActivitySummaryWindowBasisEnum;
          result.windowBasis = valueDes;
          break;
        case r'retentionDays':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(ActivitySummaryRetentionDaysEnum),
          ) as ActivitySummaryRetentionDaysEnum;
          result.retentionDays = valueDes;
          break;
        case r'accountLimit':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(ActivitySummaryAccountLimitEnum),
          ) as ActivitySummaryAccountLimitEnum;
          result.accountLimit = valueDes;
          break;
        case r'metrics':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(ActivitySummaryMetrics),
          ) as ActivitySummaryMetrics;
          result.metrics.replace(valueDes);
          break;
        default:
          unhandled.add(key);
          unhandled.add(value);
          break;
      }
    }
  }

  @override
  ActivitySummary deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = ActivitySummaryBuilder();
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

class ActivitySummaryContractVersionEnum extends EnumClass {

  @BuiltValueEnumConst(wireName: r'activity-pilot-v1')
  static const ActivitySummaryContractVersionEnum activityPilotV1 = _$activitySummaryContractVersionEnum_activityPilotV1;

  static Serializer<ActivitySummaryContractVersionEnum> get serializer => _$activitySummaryContractVersionEnumSerializer;

  const ActivitySummaryContractVersionEnum._(String name): super(name);

  static BuiltSet<ActivitySummaryContractVersionEnum> get values => _$activitySummaryContractVersionEnumValues;
  static ActivitySummaryContractVersionEnum valueOf(String name) => _$activitySummaryContractVersionEnumValueOf(name);
}

class ActivitySummaryTimezoneEnum extends EnumClass {

  @BuiltValueEnumConst(wireName: r'UTC')
  static const ActivitySummaryTimezoneEnum UTC = _$activitySummaryTimezoneEnum_UTC;

  static Serializer<ActivitySummaryTimezoneEnum> get serializer => _$activitySummaryTimezoneEnumSerializer;

  const ActivitySummaryTimezoneEnum._(String name): super(name);

  static BuiltSet<ActivitySummaryTimezoneEnum> get values => _$activitySummaryTimezoneEnumValues;
  static ActivitySummaryTimezoneEnum valueOf(String name) => _$activitySummaryTimezoneEnumValueOf(name);
}

class ActivitySummarySource_Enum extends EnumClass {

  @BuiltValueEnumConst(wireName: r'privacy.account_active_days')
  static const ActivitySummarySource_Enum privacyPeriodAccountActiveDays = _$activitySummarySourceEnum_privacyPeriodAccountActiveDays;

  static Serializer<ActivitySummarySource_Enum> get serializer => _$activitySummarySourceEnumSerializer;

  const ActivitySummarySource_Enum._(String name): super(name);

  static BuiltSet<ActivitySummarySource_Enum> get values => _$activitySummarySourceEnumValues;
  static ActivitySummarySource_Enum valueOf(String name) => _$activitySummarySourceEnumValueOf(name);
}

class ActivitySummaryWindowBasisEnum extends EnumClass {

  @BuiltValueEnumConst(wireName: r'completed_utc_days')
  static const ActivitySummaryWindowBasisEnum completedUtcDays = _$activitySummaryWindowBasisEnum_completedUtcDays;

  static Serializer<ActivitySummaryWindowBasisEnum> get serializer => _$activitySummaryWindowBasisEnumSerializer;

  const ActivitySummaryWindowBasisEnum._(String name): super(name);

  static BuiltSet<ActivitySummaryWindowBasisEnum> get values => _$activitySummaryWindowBasisEnumValues;
  static ActivitySummaryWindowBasisEnum valueOf(String name) => _$activitySummaryWindowBasisEnumValueOf(name);
}

class ActivitySummaryRetentionDaysEnum extends EnumClass {

  @BuiltValueEnumConst(wireNumber: 61)
  static const ActivitySummaryRetentionDaysEnum number61 = _$activitySummaryRetentionDaysEnum_number61;

  static Serializer<ActivitySummaryRetentionDaysEnum> get serializer => _$activitySummaryRetentionDaysEnumSerializer;

  const ActivitySummaryRetentionDaysEnum._(String name): super(name);

  static BuiltSet<ActivitySummaryRetentionDaysEnum> get values => _$activitySummaryRetentionDaysEnumValues;
  static ActivitySummaryRetentionDaysEnum valueOf(String name) => _$activitySummaryRetentionDaysEnumValueOf(name);
}

class ActivitySummaryAccountLimitEnum extends EnumClass {

  @BuiltValueEnumConst(wireNumber: 5000)
  static const ActivitySummaryAccountLimitEnum number5000 = _$activitySummaryAccountLimitEnum_number5000;

  static Serializer<ActivitySummaryAccountLimitEnum> get serializer => _$activitySummaryAccountLimitEnumSerializer;

  const ActivitySummaryAccountLimitEnum._(String name): super(name);

  static BuiltSet<ActivitySummaryAccountLimitEnum> get values => _$activitySummaryAccountLimitEnumValues;
  static ActivitySummaryAccountLimitEnum valueOf(String name) => _$activitySummaryAccountLimitEnumValueOf(name);
}
