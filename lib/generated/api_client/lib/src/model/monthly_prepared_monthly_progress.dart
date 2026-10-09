//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:built_collection/built_collection.dart';
import 'package:lythaus_api_client/src/model/monthly_prepared_action.dart';
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'monthly_prepared_monthly_progress.g.dart';

/// MonthlyPreparedMonthlyProgress
///
/// Properties:
/// * [maximumPoints]
/// * [points]
/// * [maintenancePolicyVersion]
/// * [rulesVersion]
/// * [actions]
@BuiltValue()
abstract class MonthlyPreparedMonthlyProgress implements Built<MonthlyPreparedMonthlyProgress, MonthlyPreparedMonthlyProgressBuilder> {
  @BuiltValueField(wireName: r'maximumPoints')
  int get maximumPoints;

  @BuiltValueField(wireName: r'points')
  int get points;

  @BuiltValueField(wireName: r'maintenancePolicyVersion')
  MonthlyPreparedMonthlyProgressMaintenancePolicyVersionEnum get maintenancePolicyVersion;
  // enum maintenancePolicyVersionEnum {  lythaus-monthly-rewards-2026-10-v1,  };

  @BuiltValueField(wireName: r'rulesVersion')
  String get rulesVersion;

  @BuiltValueField(wireName: r'actions')
  BuiltList<MonthlyPreparedAction> get actions;

  MonthlyPreparedMonthlyProgress._();

  factory MonthlyPreparedMonthlyProgress([void updates(MonthlyPreparedMonthlyProgressBuilder b)]) = _$MonthlyPreparedMonthlyProgress;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(MonthlyPreparedMonthlyProgressBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<MonthlyPreparedMonthlyProgress> get serializer => _$MonthlyPreparedMonthlyProgressSerializer();
}

class _$MonthlyPreparedMonthlyProgressSerializer implements PrimitiveSerializer<MonthlyPreparedMonthlyProgress> {
  @override
  final Iterable<Type> types = const [MonthlyPreparedMonthlyProgress, _$MonthlyPreparedMonthlyProgress];

  @override
  final String wireName = r'MonthlyPreparedMonthlyProgress';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    MonthlyPreparedMonthlyProgress object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    yield r'maximumPoints';
    yield serializers.serialize(
      object.maximumPoints,
      specifiedType: const FullType(int),
    );
    yield r'points';
    yield serializers.serialize(
      object.points,
      specifiedType: const FullType(int),
    );
    yield r'maintenancePolicyVersion';
    yield serializers.serialize(
      object.maintenancePolicyVersion,
      specifiedType: const FullType(MonthlyPreparedMonthlyProgressMaintenancePolicyVersionEnum),
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
    MonthlyPreparedMonthlyProgress object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required MonthlyPreparedMonthlyProgressBuilder result,
    required List<Object?> unhandled,
  }) {
    for (var i = 0; i < serializedList.length; i += 2) {
      final key = serializedList[i] as String;
      final value = serializedList[i + 1];
      switch (key) {
        case r'maximumPoints':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(int),
          ) as int;
          result.maximumPoints = valueDes;
          break;
        case r'points':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(int),
          ) as int;
          result.points = valueDes;
          break;
        case r'maintenancePolicyVersion':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(MonthlyPreparedMonthlyProgressMaintenancePolicyVersionEnum),
          ) as MonthlyPreparedMonthlyProgressMaintenancePolicyVersionEnum;
          result.maintenancePolicyVersion = valueDes;
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
  MonthlyPreparedMonthlyProgress deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = MonthlyPreparedMonthlyProgressBuilder();
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

class MonthlyPreparedMonthlyProgressMaintenancePolicyVersionEnum extends EnumClass {

  @BuiltValueEnumConst(wireName: r'lythaus-monthly-rewards-2026-10-v1')
  static const MonthlyPreparedMonthlyProgressMaintenancePolicyVersionEnum lythausMonthlyRewards202610V1 = _$monthlyPreparedMonthlyProgressMaintenancePolicyVersionEnum_lythausMonthlyRewards202610V1;

  static Serializer<MonthlyPreparedMonthlyProgressMaintenancePolicyVersionEnum> get serializer => _$monthlyPreparedMonthlyProgressMaintenancePolicyVersionEnumSerializer;

  const MonthlyPreparedMonthlyProgressMaintenancePolicyVersionEnum._(String name): super(name);

  static BuiltSet<MonthlyPreparedMonthlyProgressMaintenancePolicyVersionEnum> get values => _$monthlyPreparedMonthlyProgressMaintenancePolicyVersionEnumValues;
  static MonthlyPreparedMonthlyProgressMaintenancePolicyVersionEnum valueOf(String name) => _$monthlyPreparedMonthlyProgressMaintenancePolicyVersionEnumValueOf(name);
}
