//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:built_collection/built_collection.dart';
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'monthly_prepared_report_total.g.dart';

/// MonthlyPreparedReportTotal
///
/// Properties:
/// * [weeklyPoints]
/// * [monthlyPoints]
/// * [emailPoints]
/// * [suggestionPoints]
/// * [quarterlyPoints]
/// * [sourceScore]
/// * [calculatedLevel]
/// * [maximumSourceMonth]
@BuiltValue()
abstract class MonthlyPreparedReportTotal implements Built<MonthlyPreparedReportTotal, MonthlyPreparedReportTotalBuilder> {
  @BuiltValueField(wireName: r'weeklyPoints')
  int get weeklyPoints;

  @BuiltValueField(wireName: r'monthlyPoints')
  int get monthlyPoints;

  @BuiltValueField(wireName: r'emailPoints')
  MonthlyPreparedReportTotalEmailPointsEnum get emailPoints;
  // enum emailPointsEnum {  0,  1000,  };

  @BuiltValueField(wireName: r'suggestionPoints')
  MonthlyPreparedReportTotalSuggestionPointsEnum get suggestionPoints;
  // enum suggestionPointsEnum {  0,  150,  };

  @BuiltValueField(wireName: r'quarterlyPoints')
  MonthlyPreparedReportTotalQuarterlyPointsEnum get quarterlyPoints;
  // enum quarterlyPointsEnum {  0,  150,  1000,  1150,  };

  @BuiltValueField(wireName: r'sourceScore')
  int get sourceScore;

  @BuiltValueField(wireName: r'calculatedLevel')
  int get calculatedLevel;

  @BuiltValueField(wireName: r'maximumSourceMonth')
  int get maximumSourceMonth;

  MonthlyPreparedReportTotal._();

  factory MonthlyPreparedReportTotal([void updates(MonthlyPreparedReportTotalBuilder b)]) = _$MonthlyPreparedReportTotal;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(MonthlyPreparedReportTotalBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<MonthlyPreparedReportTotal> get serializer => _$MonthlyPreparedReportTotalSerializer();
}

class _$MonthlyPreparedReportTotalSerializer implements PrimitiveSerializer<MonthlyPreparedReportTotal> {
  @override
  final Iterable<Type> types = const [MonthlyPreparedReportTotal, _$MonthlyPreparedReportTotal];

  @override
  final String wireName = r'MonthlyPreparedReportTotal';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    MonthlyPreparedReportTotal object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    yield r'weeklyPoints';
    yield serializers.serialize(
      object.weeklyPoints,
      specifiedType: const FullType(int),
    );
    yield r'monthlyPoints';
    yield serializers.serialize(
      object.monthlyPoints,
      specifiedType: const FullType(int),
    );
    yield r'emailPoints';
    yield serializers.serialize(
      object.emailPoints,
      specifiedType: const FullType(MonthlyPreparedReportTotalEmailPointsEnum),
    );
    yield r'suggestionPoints';
    yield serializers.serialize(
      object.suggestionPoints,
      specifiedType: const FullType(MonthlyPreparedReportTotalSuggestionPointsEnum),
    );
    yield r'quarterlyPoints';
    yield serializers.serialize(
      object.quarterlyPoints,
      specifiedType: const FullType(MonthlyPreparedReportTotalQuarterlyPointsEnum),
    );
    yield r'sourceScore';
    yield serializers.serialize(
      object.sourceScore,
      specifiedType: const FullType(int),
    );
    yield r'calculatedLevel';
    yield serializers.serialize(
      object.calculatedLevel,
      specifiedType: const FullType(int),
    );
    yield r'maximumSourceMonth';
    yield serializers.serialize(
      object.maximumSourceMonth,
      specifiedType: const FullType(int),
    );
  }

  @override
  Object serialize(
    Serializers serializers,
    MonthlyPreparedReportTotal object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required MonthlyPreparedReportTotalBuilder result,
    required List<Object?> unhandled,
  }) {
    for (var i = 0; i < serializedList.length; i += 2) {
      final key = serializedList[i] as String;
      final value = serializedList[i + 1];
      switch (key) {
        case r'weeklyPoints':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(int),
          ) as int;
          result.weeklyPoints = valueDes;
          break;
        case r'monthlyPoints':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(int),
          ) as int;
          result.monthlyPoints = valueDes;
          break;
        case r'emailPoints':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(MonthlyPreparedReportTotalEmailPointsEnum),
          ) as MonthlyPreparedReportTotalEmailPointsEnum;
          result.emailPoints = valueDes;
          break;
        case r'suggestionPoints':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(MonthlyPreparedReportTotalSuggestionPointsEnum),
          ) as MonthlyPreparedReportTotalSuggestionPointsEnum;
          result.suggestionPoints = valueDes;
          break;
        case r'quarterlyPoints':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(MonthlyPreparedReportTotalQuarterlyPointsEnum),
          ) as MonthlyPreparedReportTotalQuarterlyPointsEnum;
          result.quarterlyPoints = valueDes;
          break;
        case r'sourceScore':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(int),
          ) as int;
          result.sourceScore = valueDes;
          break;
        case r'calculatedLevel':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(int),
          ) as int;
          result.calculatedLevel = valueDes;
          break;
        case r'maximumSourceMonth':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(int),
          ) as int;
          result.maximumSourceMonth = valueDes;
          break;
        default:
          unhandled.add(key);
          unhandled.add(value);
          break;
      }
    }
  }

  @override
  MonthlyPreparedReportTotal deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = MonthlyPreparedReportTotalBuilder();
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

class MonthlyPreparedReportTotalEmailPointsEnum extends EnumClass {

  @BuiltValueEnumConst(wireNumber: 0)
  static const MonthlyPreparedReportTotalEmailPointsEnum number0 = _$monthlyPreparedReportTotalEmailPointsEnum_number0;
  @BuiltValueEnumConst(wireNumber: 1000)
  static const MonthlyPreparedReportTotalEmailPointsEnum number1000 = _$monthlyPreparedReportTotalEmailPointsEnum_number1000;

  static Serializer<MonthlyPreparedReportTotalEmailPointsEnum> get serializer => _$monthlyPreparedReportTotalEmailPointsEnumSerializer;

  const MonthlyPreparedReportTotalEmailPointsEnum._(String name): super(name);

  static BuiltSet<MonthlyPreparedReportTotalEmailPointsEnum> get values => _$monthlyPreparedReportTotalEmailPointsEnumValues;
  static MonthlyPreparedReportTotalEmailPointsEnum valueOf(String name) => _$monthlyPreparedReportTotalEmailPointsEnumValueOf(name);
}

class MonthlyPreparedReportTotalSuggestionPointsEnum extends EnumClass {

  @BuiltValueEnumConst(wireNumber: 0)
  static const MonthlyPreparedReportTotalSuggestionPointsEnum number0 = _$monthlyPreparedReportTotalSuggestionPointsEnum_number0;
  @BuiltValueEnumConst(wireNumber: 150)
  static const MonthlyPreparedReportTotalSuggestionPointsEnum number150 = _$monthlyPreparedReportTotalSuggestionPointsEnum_number150;

  static Serializer<MonthlyPreparedReportTotalSuggestionPointsEnum> get serializer => _$monthlyPreparedReportTotalSuggestionPointsEnumSerializer;

  const MonthlyPreparedReportTotalSuggestionPointsEnum._(String name): super(name);

  static BuiltSet<MonthlyPreparedReportTotalSuggestionPointsEnum> get values => _$monthlyPreparedReportTotalSuggestionPointsEnumValues;
  static MonthlyPreparedReportTotalSuggestionPointsEnum valueOf(String name) => _$monthlyPreparedReportTotalSuggestionPointsEnumValueOf(name);
}

class MonthlyPreparedReportTotalQuarterlyPointsEnum extends EnumClass {

  @BuiltValueEnumConst(wireNumber: 0)
  static const MonthlyPreparedReportTotalQuarterlyPointsEnum number0 = _$monthlyPreparedReportTotalQuarterlyPointsEnum_number0;
  @BuiltValueEnumConst(wireNumber: 150)
  static const MonthlyPreparedReportTotalQuarterlyPointsEnum number150 = _$monthlyPreparedReportTotalQuarterlyPointsEnum_number150;
  @BuiltValueEnumConst(wireNumber: 1000)
  static const MonthlyPreparedReportTotalQuarterlyPointsEnum number1000 = _$monthlyPreparedReportTotalQuarterlyPointsEnum_number1000;
  @BuiltValueEnumConst(wireNumber: 1150)
  static const MonthlyPreparedReportTotalQuarterlyPointsEnum number1150 = _$monthlyPreparedReportTotalQuarterlyPointsEnum_number1150;

  static Serializer<MonthlyPreparedReportTotalQuarterlyPointsEnum> get serializer => _$monthlyPreparedReportTotalQuarterlyPointsEnumSerializer;

  const MonthlyPreparedReportTotalQuarterlyPointsEnum._(String name): super(name);

  static BuiltSet<MonthlyPreparedReportTotalQuarterlyPointsEnum> get values => _$monthlyPreparedReportTotalQuarterlyPointsEnumValues;
  static MonthlyPreparedReportTotalQuarterlyPointsEnum valueOf(String name) => _$monthlyPreparedReportTotalQuarterlyPointsEnumValueOf(name);
}
