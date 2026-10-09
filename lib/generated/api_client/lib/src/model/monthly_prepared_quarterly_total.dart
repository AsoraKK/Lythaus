//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:built_collection/built_collection.dart';
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'monthly_prepared_quarterly_total.g.dart';

/// MonthlyPreparedQuarterlyTotal
///
/// Properties:
/// * [maximumPoints]
/// * [points]
@BuiltValue()
abstract class MonthlyPreparedQuarterlyTotal implements Built<MonthlyPreparedQuarterlyTotal, MonthlyPreparedQuarterlyTotalBuilder> {
  @BuiltValueField(wireName: r'maximumPoints')
  int get maximumPoints;

  @BuiltValueField(wireName: r'points')
  MonthlyPreparedQuarterlyTotalPointsEnum get points;
  // enum pointsEnum {  0,  150,  1000,  1150,  };

  MonthlyPreparedQuarterlyTotal._();

  factory MonthlyPreparedQuarterlyTotal([void updates(MonthlyPreparedQuarterlyTotalBuilder b)]) = _$MonthlyPreparedQuarterlyTotal;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(MonthlyPreparedQuarterlyTotalBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<MonthlyPreparedQuarterlyTotal> get serializer => _$MonthlyPreparedQuarterlyTotalSerializer();
}

class _$MonthlyPreparedQuarterlyTotalSerializer implements PrimitiveSerializer<MonthlyPreparedQuarterlyTotal> {
  @override
  final Iterable<Type> types = const [MonthlyPreparedQuarterlyTotal, _$MonthlyPreparedQuarterlyTotal];

  @override
  final String wireName = r'MonthlyPreparedQuarterlyTotal';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    MonthlyPreparedQuarterlyTotal object, {
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
      specifiedType: const FullType(MonthlyPreparedQuarterlyTotalPointsEnum),
    );
  }

  @override
  Object serialize(
    Serializers serializers,
    MonthlyPreparedQuarterlyTotal object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required MonthlyPreparedQuarterlyTotalBuilder result,
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
            specifiedType: const FullType(MonthlyPreparedQuarterlyTotalPointsEnum),
          ) as MonthlyPreparedQuarterlyTotalPointsEnum;
          result.points = valueDes;
          break;
        default:
          unhandled.add(key);
          unhandled.add(value);
          break;
      }
    }
  }

  @override
  MonthlyPreparedQuarterlyTotal deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = MonthlyPreparedQuarterlyTotalBuilder();
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

class MonthlyPreparedQuarterlyTotalPointsEnum extends EnumClass {

  @BuiltValueEnumConst(wireNumber: 0)
  static const MonthlyPreparedQuarterlyTotalPointsEnum number0 = _$monthlyPreparedQuarterlyTotalPointsEnum_number0;
  @BuiltValueEnumConst(wireNumber: 150)
  static const MonthlyPreparedQuarterlyTotalPointsEnum number150 = _$monthlyPreparedQuarterlyTotalPointsEnum_number150;
  @BuiltValueEnumConst(wireNumber: 1000)
  static const MonthlyPreparedQuarterlyTotalPointsEnum number1000 = _$monthlyPreparedQuarterlyTotalPointsEnum_number1000;
  @BuiltValueEnumConst(wireNumber: 1150)
  static const MonthlyPreparedQuarterlyTotalPointsEnum number1150 = _$monthlyPreparedQuarterlyTotalPointsEnum_number1150;

  static Serializer<MonthlyPreparedQuarterlyTotalPointsEnum> get serializer => _$monthlyPreparedQuarterlyTotalPointsEnumSerializer;

  const MonthlyPreparedQuarterlyTotalPointsEnum._(String name): super(name);

  static BuiltSet<MonthlyPreparedQuarterlyTotalPointsEnum> get values => _$monthlyPreparedQuarterlyTotalPointsEnumValues;
  static MonthlyPreparedQuarterlyTotalPointsEnum valueOf(String name) => _$monthlyPreparedQuarterlyTotalPointsEnumValueOf(name);
}
