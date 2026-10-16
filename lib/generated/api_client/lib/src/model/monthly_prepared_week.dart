//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:built_collection/built_collection.dart';
import 'package:lythaus_api_client/src/model/monthly_prepared_action.dart';
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'monthly_prepared_week.g.dart';

/// Whole weekly total from the reused v1 earning engine. Known endpoints must match the explicitly captured convention and identify a distinct canonical week; missing endpoints remain null. Internal week IDs and inferred endpoints are omitted.
///
/// Properties:
/// * [startsAt]
/// * [endsAt]
/// * [points]
/// * [revision]
/// * [state]
/// * [selected]
/// * [selectionReason]
/// * [earningPolicyVersion]
/// * [rulesVersion]
/// * [actions]
@BuiltValue()
abstract class MonthlyPreparedWeek implements Built<MonthlyPreparedWeek, MonthlyPreparedWeekBuilder> {
  @BuiltValueField(wireName: r'startsAt')
  DateTime? get startsAt;

  @BuiltValueField(wireName: r'endsAt')
  DateTime? get endsAt;

  @BuiltValueField(wireName: r'points')
  int get points;

  @BuiltValueField(wireName: r'revision')
  int? get revision;

  @BuiltValueField(wireName: r'state')
  String get state;

  @BuiltValueField(wireName: r'selected')
  bool? get selected;

  @BuiltValueField(wireName: r'selectionReason')
  String? get selectionReason;

  @BuiltValueField(wireName: r'earningPolicyVersion')
  MonthlyPreparedWeekEarningPolicyVersionEnum get earningPolicyVersion;
  // enum earningPolicyVersionEnum {  lythaus-monthly-rewards-2026-10-v1,  };

  @BuiltValueField(wireName: r'rulesVersion')
  String get rulesVersion;

  @BuiltValueField(wireName: r'actions')
  BuiltList<MonthlyPreparedAction> get actions;

  MonthlyPreparedWeek._();

  factory MonthlyPreparedWeek([void updates(MonthlyPreparedWeekBuilder b)]) = _$MonthlyPreparedWeek;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(MonthlyPreparedWeekBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<MonthlyPreparedWeek> get serializer => _$MonthlyPreparedWeekSerializer();
}

class _$MonthlyPreparedWeekSerializer implements PrimitiveSerializer<MonthlyPreparedWeek> {
  @override
  final Iterable<Type> types = const [MonthlyPreparedWeek, _$MonthlyPreparedWeek];

  @override
  final String wireName = r'MonthlyPreparedWeek';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    MonthlyPreparedWeek object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    yield r'startsAt';
    yield object.startsAt == null ? null : serializers.serialize(
      object.startsAt,
      specifiedType: const FullType.nullable(DateTime),
    );
    yield r'endsAt';
    yield object.endsAt == null ? null : serializers.serialize(
      object.endsAt,
      specifiedType: const FullType.nullable(DateTime),
    );
    yield r'points';
    yield serializers.serialize(
      object.points,
      specifiedType: const FullType(int),
    );
    yield r'revision';
    yield object.revision == null ? null : serializers.serialize(
      object.revision,
      specifiedType: const FullType.nullable(int),
    );
    yield r'state';
    yield serializers.serialize(
      object.state,
      specifiedType: const FullType(String),
    );
    yield r'selected';
    yield object.selected == null ? null : serializers.serialize(
      object.selected,
      specifiedType: const FullType.nullable(bool),
    );
    yield r'selectionReason';
    yield object.selectionReason == null ? null : serializers.serialize(
      object.selectionReason,
      specifiedType: const FullType.nullable(String),
    );
    yield r'earningPolicyVersion';
    yield serializers.serialize(
      object.earningPolicyVersion,
      specifiedType: const FullType(MonthlyPreparedWeekEarningPolicyVersionEnum),
    );
    yield r'rulesVersion';
    yield serializers.serialize(
      object.rulesVersion,
      specifiedType: const FullType(String),
    );
    yield r'actions';
    yield serializers.serialize(
      object.actions,
      specifiedType: const FullType(BuiltList, [FullType(MonthlyPreparedAction)]),
    );
  }

  @override
  Object serialize(
    Serializers serializers,
    MonthlyPreparedWeek object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required MonthlyPreparedWeekBuilder result,
    required List<Object?> unhandled,
  }) {
    for (var i = 0; i < serializedList.length; i += 2) {
      final key = serializedList[i] as String;
      final value = serializedList[i + 1];
      switch (key) {
        case r'startsAt':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType.nullable(DateTime),
          ) as DateTime?;
          if (valueDes == null) continue;
          result.startsAt = valueDes;
          break;
        case r'endsAt':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType.nullable(DateTime),
          ) as DateTime?;
          if (valueDes == null) continue;
          result.endsAt = valueDes;
          break;
        case r'points':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(int),
          ) as int;
          result.points = valueDes;
          break;
        case r'revision':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType.nullable(int),
          ) as int?;
          if (valueDes == null) continue;
          result.revision = valueDes;
          break;
        case r'state':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.state = valueDes;
          break;
        case r'selected':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType.nullable(bool),
          ) as bool?;
          if (valueDes == null) continue;
          result.selected = valueDes;
          break;
        case r'selectionReason':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType.nullable(String),
          ) as String?;
          if (valueDes == null) continue;
          result.selectionReason = valueDes;
          break;
        case r'earningPolicyVersion':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(MonthlyPreparedWeekEarningPolicyVersionEnum),
          ) as MonthlyPreparedWeekEarningPolicyVersionEnum;
          result.earningPolicyVersion = valueDes;
          break;
        case r'rulesVersion':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.rulesVersion = valueDes;
          break;
        case r'actions':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(BuiltList, [FullType(MonthlyPreparedAction)]),
          ) as BuiltList<MonthlyPreparedAction>;
          result.actions.replace(valueDes);
          break;
        default:
          unhandled.add(key);
          unhandled.add(value);
          break;
      }
    }
  }

  @override
  MonthlyPreparedWeek deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = MonthlyPreparedWeekBuilder();
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

class MonthlyPreparedWeekEarningPolicyVersionEnum extends EnumClass {

  @BuiltValueEnumConst(wireName: r'lythaus-monthly-rewards-2026-10-v1')
  static const MonthlyPreparedWeekEarningPolicyVersionEnum lythausMonthlyRewards202610V1 = _$monthlyPreparedWeekEarningPolicyVersionEnum_lythausMonthlyRewards202610V1;

  static Serializer<MonthlyPreparedWeekEarningPolicyVersionEnum> get serializer => _$monthlyPreparedWeekEarningPolicyVersionEnumSerializer;

  const MonthlyPreparedWeekEarningPolicyVersionEnum._(String name): super(name);

  static BuiltSet<MonthlyPreparedWeekEarningPolicyVersionEnum> get values => _$monthlyPreparedWeekEarningPolicyVersionEnumValues;
  static MonthlyPreparedWeekEarningPolicyVersionEnum valueOf(String name) => _$monthlyPreparedWeekEarningPolicyVersionEnumValueOf(name);
}
