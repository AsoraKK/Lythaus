//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:built_collection/built_collection.dart';
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'monthly_prepared_email_qualification.g.dart';

/// Fixed completion-month through calendar-quarter-end validity, with no earlier credit or carry. Unavailable validity evidence remains null; known windows require validFrom before validUntil.
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
abstract class MonthlyPreparedEmailQualification implements Built<MonthlyPreparedEmailQualification, MonthlyPreparedEmailQualificationBuilder> {
  @BuiltValueField(wireName: r'actionId')
  MonthlyPreparedEmailQualificationActionIdEnum get actionId;
  // enum actionIdEnum {  quarterly.email_control,  };

  @BuiltValueField(wireName: r'maximumPoints')
  int get maximumPoints;

  @BuiltValueField(wireName: r'points')
  MonthlyPreparedEmailQualificationPointsEnum get points;
  // enum pointsEnum {  0,  1000,  };

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

  MonthlyPreparedEmailQualification._();

  factory MonthlyPreparedEmailQualification([void updates(MonthlyPreparedEmailQualificationBuilder b)]) = _$MonthlyPreparedEmailQualification;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(MonthlyPreparedEmailQualificationBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<MonthlyPreparedEmailQualification> get serializer => _$MonthlyPreparedEmailQualificationSerializer();
}

class _$MonthlyPreparedEmailQualificationSerializer implements PrimitiveSerializer<MonthlyPreparedEmailQualification> {
  @override
  final Iterable<Type> types = const [MonthlyPreparedEmailQualification, _$MonthlyPreparedEmailQualification];

  @override
  final String wireName = r'MonthlyPreparedEmailQualification';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    MonthlyPreparedEmailQualification object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    yield r'actionId';
    yield serializers.serialize(
      object.actionId,
      specifiedType: const FullType(MonthlyPreparedEmailQualificationActionIdEnum),
    );
    yield r'maximumPoints';
    yield serializers.serialize(
      object.maximumPoints,
      specifiedType: const FullType(int),
    );
    yield r'points';
    yield serializers.serialize(
      object.points,
      specifiedType: const FullType(MonthlyPreparedEmailQualificationPointsEnum),
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
    MonthlyPreparedEmailQualification object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required MonthlyPreparedEmailQualificationBuilder result,
    required List<Object?> unhandled,
  }) {
    for (var i = 0; i < serializedList.length; i += 2) {
      final key = serializedList[i] as String;
      final value = serializedList[i + 1];
      switch (key) {
        case r'actionId':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(MonthlyPreparedEmailQualificationActionIdEnum),
          ) as MonthlyPreparedEmailQualificationActionIdEnum;
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
            specifiedType: const FullType(MonthlyPreparedEmailQualificationPointsEnum),
          ) as MonthlyPreparedEmailQualificationPointsEnum;
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
  MonthlyPreparedEmailQualification deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = MonthlyPreparedEmailQualificationBuilder();
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

class MonthlyPreparedEmailQualificationActionIdEnum extends EnumClass {

  @BuiltValueEnumConst(wireName: r'quarterly.email_control')
  static const MonthlyPreparedEmailQualificationActionIdEnum quarterlyPeriodEmailControl = _$monthlyPreparedEmailQualificationActionIdEnum_quarterlyPeriodEmailControl;

  static Serializer<MonthlyPreparedEmailQualificationActionIdEnum> get serializer => _$monthlyPreparedEmailQualificationActionIdEnumSerializer;

  const MonthlyPreparedEmailQualificationActionIdEnum._(String name): super(name);

  static BuiltSet<MonthlyPreparedEmailQualificationActionIdEnum> get values => _$monthlyPreparedEmailQualificationActionIdEnumValues;
  static MonthlyPreparedEmailQualificationActionIdEnum valueOf(String name) => _$monthlyPreparedEmailQualificationActionIdEnumValueOf(name);
}

class MonthlyPreparedEmailQualificationPointsEnum extends EnumClass {

  @BuiltValueEnumConst(wireNumber: 0)
  static const MonthlyPreparedEmailQualificationPointsEnum number0 = _$monthlyPreparedEmailQualificationPointsEnum_number0;
  @BuiltValueEnumConst(wireNumber: 1000)
  static const MonthlyPreparedEmailQualificationPointsEnum number1000 = _$monthlyPreparedEmailQualificationPointsEnum_number1000;

  static Serializer<MonthlyPreparedEmailQualificationPointsEnum> get serializer => _$monthlyPreparedEmailQualificationPointsEnumSerializer;

  const MonthlyPreparedEmailQualificationPointsEnum._(String name): super(name);

  static BuiltSet<MonthlyPreparedEmailQualificationPointsEnum> get values => _$monthlyPreparedEmailQualificationPointsEnumValues;
  static MonthlyPreparedEmailQualificationPointsEnum valueOf(String name) => _$monthlyPreparedEmailQualificationPointsEnumValueOf(name);
}
