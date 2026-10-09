//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:built_collection/built_collection.dart';
import 'package:lythaus_api_client/src/model/monthly_prepared_week.dart';
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'monthly_prepared_weekly_progress.g.dart';

/// MonthlyPreparedWeeklyProgress
///
/// Properties:
/// * [maximumPerWeek]
/// * [selectedWeekLimit]
/// * [maximumSelectedWeeklyPoints]
/// * [points]
/// * [earningPolicyVersion]
/// * [rulesVersion]
/// * [periodPolicyVersion]
/// * [periodPolicyStatus]
/// * [selectedWeeks]
/// * [omittedWeeks]
/// * [missingWeeks]
/// * [unassessedWeeks]
@BuiltValue()
abstract class MonthlyPreparedWeeklyProgress implements Built<MonthlyPreparedWeeklyProgress, MonthlyPreparedWeeklyProgressBuilder> {
  @BuiltValueField(wireName: r'maximumPerWeek')
  int get maximumPerWeek;

  @BuiltValueField(wireName: r'selectedWeekLimit')
  int get selectedWeekLimit;

  @BuiltValueField(wireName: r'maximumSelectedWeeklyPoints')
  int get maximumSelectedWeeklyPoints;

  @BuiltValueField(wireName: r'points')
  int? get points;

  @BuiltValueField(wireName: r'earningPolicyVersion')
  MonthlyPreparedWeeklyProgressEarningPolicyVersionEnum get earningPolicyVersion;
  // enum earningPolicyVersionEnum {  lythaus-monthly-rewards-2026-10-v1,  };

  @BuiltValueField(wireName: r'rulesVersion')
  String get rulesVersion;

  @BuiltValueField(wireName: r'periodPolicyVersion')
  String? get periodPolicyVersion;

  @BuiltValueField(wireName: r'periodPolicyStatus')
  MonthlyPreparedWeeklyProgressPeriodPolicyStatusEnum get periodPolicyStatus;
  // enum periodPolicyStatusEnum {  unavailable,  pending_owner_approval,  };

  @BuiltValueField(wireName: r'selectedWeeks')
  BuiltList<MonthlyPreparedWeek> get selectedWeeks;

  @BuiltValueField(wireName: r'omittedWeeks')
  BuiltList<MonthlyPreparedWeek> get omittedWeeks;

  @BuiltValueField(wireName: r'missingWeeks')
  BuiltList<MonthlyPreparedWeek> get missingWeeks;

  @BuiltValueField(wireName: r'unassessedWeeks')
  BuiltList<MonthlyPreparedWeek> get unassessedWeeks;

  MonthlyPreparedWeeklyProgress._();

  factory MonthlyPreparedWeeklyProgress([void updates(MonthlyPreparedWeeklyProgressBuilder b)]) = _$MonthlyPreparedWeeklyProgress;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(MonthlyPreparedWeeklyProgressBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<MonthlyPreparedWeeklyProgress> get serializer => _$MonthlyPreparedWeeklyProgressSerializer();
}

class _$MonthlyPreparedWeeklyProgressSerializer implements PrimitiveSerializer<MonthlyPreparedWeeklyProgress> {
  @override
  final Iterable<Type> types = const [MonthlyPreparedWeeklyProgress, _$MonthlyPreparedWeeklyProgress];

  @override
  final String wireName = r'MonthlyPreparedWeeklyProgress';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    MonthlyPreparedWeeklyProgress object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    yield r'maximumPerWeek';
    yield serializers.serialize(
      object.maximumPerWeek,
      specifiedType: const FullType(int),
    );
    yield r'selectedWeekLimit';
    yield serializers.serialize(
      object.selectedWeekLimit,
      specifiedType: const FullType(int),
    );
    yield r'maximumSelectedWeeklyPoints';
    yield serializers.serialize(
      object.maximumSelectedWeeklyPoints,
      specifiedType: const FullType(int),
    );
    yield r'points';
    yield object.points == null ? null : serializers.serialize(
      object.points,
      specifiedType: const FullType.nullable(int),
    );
    yield r'earningPolicyVersion';
    yield serializers.serialize(
      object.earningPolicyVersion,
      specifiedType: const FullType(MonthlyPreparedWeeklyProgressEarningPolicyVersionEnum),
    );
    yield r'rulesVersion';
    yield serializers.serialize(
      object.rulesVersion,
      specifiedType: const FullType(String),
    );
    yield r'periodPolicyVersion';
    yield object.periodPolicyVersion == null ? null : serializers.serialize(
      object.periodPolicyVersion,
      specifiedType: const FullType.nullable(String),
    );
    yield r'periodPolicyStatus';
    yield serializers.serialize(
      object.periodPolicyStatus,
      specifiedType: const FullType(MonthlyPreparedWeeklyProgressPeriodPolicyStatusEnum),
    );
    yield r'selectedWeeks';
    yield serializers.serialize(
      object.selectedWeeks,
      specifiedType: const FullType(BuiltList, [FullType(MonthlyPreparedWeek)]),
    );
    yield r'omittedWeeks';
    yield serializers.serialize(
      object.omittedWeeks,
      specifiedType: const FullType(BuiltList, [FullType(MonthlyPreparedWeek)]),
    );
    yield r'missingWeeks';
    yield serializers.serialize(
      object.missingWeeks,
      specifiedType: const FullType(BuiltList, [FullType(MonthlyPreparedWeek)]),
    );
    yield r'unassessedWeeks';
    yield serializers.serialize(
      object.unassessedWeeks,
      specifiedType: const FullType(BuiltList, [FullType(MonthlyPreparedWeek)]),
    );
  }

  @override
  Object serialize(
    Serializers serializers,
    MonthlyPreparedWeeklyProgress object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required MonthlyPreparedWeeklyProgressBuilder result,
    required List<Object?> unhandled,
  }) {
    for (var i = 0; i < serializedList.length; i += 2) {
      final key = serializedList[i] as String;
      final value = serializedList[i + 1];
      switch (key) {
        case r'maximumPerWeek':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(int),
          ) as int;
          result.maximumPerWeek = valueDes;
          break;
        case r'selectedWeekLimit':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(int),
          ) as int;
          result.selectedWeekLimit = valueDes;
          break;
        case r'maximumSelectedWeeklyPoints':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(int),
          ) as int;
          result.maximumSelectedWeeklyPoints = valueDes;
          break;
        case r'points':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType.nullable(int),
          ) as int?;
          if (valueDes == null) continue;
          result.points = valueDes;
          break;
        case r'earningPolicyVersion':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(MonthlyPreparedWeeklyProgressEarningPolicyVersionEnum),
          ) as MonthlyPreparedWeeklyProgressEarningPolicyVersionEnum;
          result.earningPolicyVersion = valueDes;
          break;
        case r'rulesVersion':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.rulesVersion = valueDes;
          break;
        case r'periodPolicyVersion':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType.nullable(String),
          ) as String?;
          if (valueDes == null) continue;
          result.periodPolicyVersion = valueDes;
          break;
        case r'periodPolicyStatus':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(MonthlyPreparedWeeklyProgressPeriodPolicyStatusEnum),
          ) as MonthlyPreparedWeeklyProgressPeriodPolicyStatusEnum;
          result.periodPolicyStatus = valueDes;
          break;
        case r'selectedWeeks':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(BuiltList, [FullType(MonthlyPreparedWeek)]),
          ) as BuiltList<MonthlyPreparedWeek>;
          result.selectedWeeks.replace(valueDes);
          break;
        case r'omittedWeeks':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(BuiltList, [FullType(MonthlyPreparedWeek)]),
          ) as BuiltList<MonthlyPreparedWeek>;
          result.omittedWeeks.replace(valueDes);
          break;
        case r'missingWeeks':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(BuiltList, [FullType(MonthlyPreparedWeek)]),
          ) as BuiltList<MonthlyPreparedWeek>;
          result.missingWeeks.replace(valueDes);
          break;
        case r'unassessedWeeks':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(BuiltList, [FullType(MonthlyPreparedWeek)]),
          ) as BuiltList<MonthlyPreparedWeek>;
          result.unassessedWeeks.replace(valueDes);
          break;
        default:
          unhandled.add(key);
          unhandled.add(value);
          break;
      }
    }
  }

  @override
  MonthlyPreparedWeeklyProgress deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = MonthlyPreparedWeeklyProgressBuilder();
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

class MonthlyPreparedWeeklyProgressEarningPolicyVersionEnum extends EnumClass {

  @BuiltValueEnumConst(wireName: r'lythaus-monthly-rewards-2026-10-v1')
  static const MonthlyPreparedWeeklyProgressEarningPolicyVersionEnum lythausMonthlyRewards202610V1 = _$monthlyPreparedWeeklyProgressEarningPolicyVersionEnum_lythausMonthlyRewards202610V1;

  static Serializer<MonthlyPreparedWeeklyProgressEarningPolicyVersionEnum> get serializer => _$monthlyPreparedWeeklyProgressEarningPolicyVersionEnumSerializer;

  const MonthlyPreparedWeeklyProgressEarningPolicyVersionEnum._(String name): super(name);

  static BuiltSet<MonthlyPreparedWeeklyProgressEarningPolicyVersionEnum> get values => _$monthlyPreparedWeeklyProgressEarningPolicyVersionEnumValues;
  static MonthlyPreparedWeeklyProgressEarningPolicyVersionEnum valueOf(String name) => _$monthlyPreparedWeeklyProgressEarningPolicyVersionEnumValueOf(name);
}

class MonthlyPreparedWeeklyProgressPeriodPolicyStatusEnum extends EnumClass {

  @BuiltValueEnumConst(wireName: r'unavailable')
  static const MonthlyPreparedWeeklyProgressPeriodPolicyStatusEnum unavailable = _$monthlyPreparedWeeklyProgressPeriodPolicyStatusEnum_unavailable;
  @BuiltValueEnumConst(wireName: r'pending_owner_approval')
  static const MonthlyPreparedWeeklyProgressPeriodPolicyStatusEnum pendingOwnerApproval = _$monthlyPreparedWeeklyProgressPeriodPolicyStatusEnum_pendingOwnerApproval;

  static Serializer<MonthlyPreparedWeeklyProgressPeriodPolicyStatusEnum> get serializer => _$monthlyPreparedWeeklyProgressPeriodPolicyStatusEnumSerializer;

  const MonthlyPreparedWeeklyProgressPeriodPolicyStatusEnum._(String name): super(name);

  static BuiltSet<MonthlyPreparedWeeklyProgressPeriodPolicyStatusEnum> get values => _$monthlyPreparedWeeklyProgressPeriodPolicyStatusEnumValues;
  static MonthlyPreparedWeeklyProgressPeriodPolicyStatusEnum valueOf(String name) => _$monthlyPreparedWeeklyProgressPeriodPolicyStatusEnumValueOf(name);
}
