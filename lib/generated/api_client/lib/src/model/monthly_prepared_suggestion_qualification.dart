//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:built_collection/built_collection.dart';
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'monthly_prepared_suggestion_qualification.g.dart';

/// Optional suggestion qualification follows the same fixed calendar-quarter validity as email. The award is 150 or zero; unavailable evidence is never inferred from the source month.
///
/// Properties:
/// * [actionId]
/// * [maximumPoints]
/// * [points]
/// * [qualifies]
/// * [reasonCode]
/// * [validFrom]
/// * [validUntil]
/// * [renewalRequired]
@BuiltValue()
abstract class MonthlyPreparedSuggestionQualification implements Built<MonthlyPreparedSuggestionQualification, MonthlyPreparedSuggestionQualificationBuilder> {
  @BuiltValueField(wireName: r'actionId')
  MonthlyPreparedSuggestionQualificationActionIdEnum get actionId;
  // enum actionIdEnum {  quarterly.suggestion,  };

  @BuiltValueField(wireName: r'maximumPoints')
  int get maximumPoints;

  @BuiltValueField(wireName: r'points')
  MonthlyPreparedSuggestionQualificationPointsEnum get points;
  // enum pointsEnum {  0,  150,  };

  @BuiltValueField(wireName: r'qualifies')
  bool get qualifies;

  @BuiltValueField(wireName: r'reasonCode')
  String? get reasonCode;

  @BuiltValueField(wireName: r'validFrom')
  DateTime? get validFrom;

  @BuiltValueField(wireName: r'validUntil')
  DateTime? get validUntil;

  @BuiltValueField(wireName: r'renewalRequired')
  bool? get renewalRequired;

  MonthlyPreparedSuggestionQualification._();

  factory MonthlyPreparedSuggestionQualification([void updates(MonthlyPreparedSuggestionQualificationBuilder b)]) = _$MonthlyPreparedSuggestionQualification;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(MonthlyPreparedSuggestionQualificationBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<MonthlyPreparedSuggestionQualification> get serializer => _$MonthlyPreparedSuggestionQualificationSerializer();
}

class _$MonthlyPreparedSuggestionQualificationSerializer implements PrimitiveSerializer<MonthlyPreparedSuggestionQualification> {
  @override
  final Iterable<Type> types = const [MonthlyPreparedSuggestionQualification, _$MonthlyPreparedSuggestionQualification];

  @override
  final String wireName = r'MonthlyPreparedSuggestionQualification';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    MonthlyPreparedSuggestionQualification object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    yield r'actionId';
    yield serializers.serialize(
      object.actionId,
      specifiedType: const FullType(MonthlyPreparedSuggestionQualificationActionIdEnum),
    );
    yield r'maximumPoints';
    yield serializers.serialize(
      object.maximumPoints,
      specifiedType: const FullType(int),
    );
    yield r'points';
    yield serializers.serialize(
      object.points,
      specifiedType: const FullType(MonthlyPreparedSuggestionQualificationPointsEnum),
    );
    yield r'qualifies';
    yield serializers.serialize(
      object.qualifies,
      specifiedType: const FullType(bool),
    );
    yield r'reasonCode';
    yield object.reasonCode == null ? null : serializers.serialize(
      object.reasonCode,
      specifiedType: const FullType.nullable(String),
    );
    yield r'validFrom';
    yield object.validFrom == null ? null : serializers.serialize(
      object.validFrom,
      specifiedType: const FullType.nullable(DateTime),
    );
    yield r'validUntil';
    yield object.validUntil == null ? null : serializers.serialize(
      object.validUntil,
      specifiedType: const FullType.nullable(DateTime),
    );
    yield r'renewalRequired';
    yield object.renewalRequired == null ? null : serializers.serialize(
      object.renewalRequired,
      specifiedType: const FullType.nullable(bool),
    );
  }

  @override
  Object serialize(
    Serializers serializers,
    MonthlyPreparedSuggestionQualification object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required MonthlyPreparedSuggestionQualificationBuilder result,
    required List<Object?> unhandled,
  }) {
    for (var i = 0; i < serializedList.length; i += 2) {
      final key = serializedList[i] as String;
      final value = serializedList[i + 1];
      switch (key) {
        case r'actionId':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(MonthlyPreparedSuggestionQualificationActionIdEnum),
          ) as MonthlyPreparedSuggestionQualificationActionIdEnum;
          result.actionId = valueDes;
          break;
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
            specifiedType: const FullType(MonthlyPreparedSuggestionQualificationPointsEnum),
          ) as MonthlyPreparedSuggestionQualificationPointsEnum;
          result.points = valueDes;
          break;
        case r'qualifies':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(bool),
          ) as bool;
          result.qualifies = valueDes;
          break;
        case r'reasonCode':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType.nullable(String),
          ) as String?;
          if (valueDes == null) continue;
          result.reasonCode = valueDes;
          break;
        case r'validFrom':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType.nullable(DateTime),
          ) as DateTime?;
          if (valueDes == null) continue;
          result.validFrom = valueDes;
          break;
        case r'validUntil':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType.nullable(DateTime),
          ) as DateTime?;
          if (valueDes == null) continue;
          result.validUntil = valueDes;
          break;
        case r'renewalRequired':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType.nullable(bool),
          ) as bool?;
          if (valueDes == null) continue;
          result.renewalRequired = valueDes;
          break;
        default:
          unhandled.add(key);
          unhandled.add(value);
          break;
      }
    }
  }

  @override
  MonthlyPreparedSuggestionQualification deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = MonthlyPreparedSuggestionQualificationBuilder();
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

class MonthlyPreparedSuggestionQualificationActionIdEnum extends EnumClass {

  @BuiltValueEnumConst(wireName: r'quarterly.suggestion')
  static const MonthlyPreparedSuggestionQualificationActionIdEnum quarterlyPeriodSuggestion = _$monthlyPreparedSuggestionQualificationActionIdEnum_quarterlyPeriodSuggestion;

  static Serializer<MonthlyPreparedSuggestionQualificationActionIdEnum> get serializer => _$monthlyPreparedSuggestionQualificationActionIdEnumSerializer;

  const MonthlyPreparedSuggestionQualificationActionIdEnum._(String name): super(name);

  static BuiltSet<MonthlyPreparedSuggestionQualificationActionIdEnum> get values => _$monthlyPreparedSuggestionQualificationActionIdEnumValues;
  static MonthlyPreparedSuggestionQualificationActionIdEnum valueOf(String name) => _$monthlyPreparedSuggestionQualificationActionIdEnumValueOf(name);
}

class MonthlyPreparedSuggestionQualificationPointsEnum extends EnumClass {

  @BuiltValueEnumConst(wireNumber: 0)
  static const MonthlyPreparedSuggestionQualificationPointsEnum number0 = _$monthlyPreparedSuggestionQualificationPointsEnum_number0;
  @BuiltValueEnumConst(wireNumber: 150)
  static const MonthlyPreparedSuggestionQualificationPointsEnum number150 = _$monthlyPreparedSuggestionQualificationPointsEnum_number150;

  static Serializer<MonthlyPreparedSuggestionQualificationPointsEnum> get serializer => _$monthlyPreparedSuggestionQualificationPointsEnumSerializer;

  const MonthlyPreparedSuggestionQualificationPointsEnum._(String name): super(name);

  static BuiltSet<MonthlyPreparedSuggestionQualificationPointsEnum> get values => _$monthlyPreparedSuggestionQualificationPointsEnumValues;
  static MonthlyPreparedSuggestionQualificationPointsEnum valueOf(String name) => _$monthlyPreparedSuggestionQualificationPointsEnumValueOf(name);
}
