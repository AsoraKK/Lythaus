//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:built_collection/built_collection.dart';
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'overview_metric.g.dart';

/// OverviewMetric
///
/// Properties:
/// * [value]
/// * [previous]
/// * [changePercent] - Unavailable for missing data or a zero prior denominator.
/// * [availability]
/// * [reason]
/// * [source_]
/// * [definition]
/// * [unit]
@BuiltValue()
abstract class OverviewMetric implements Built<OverviewMetric, OverviewMetricBuilder> {
  @BuiltValueField(wireName: r'value')
  num? get value;

  @BuiltValueField(wireName: r'previous')
  num? get previous;

  /// Unavailable for missing data or a zero prior denominator.
  @BuiltValueField(wireName: r'changePercent')
  num? get changePercent;

  @BuiltValueField(wireName: r'availability')
  OverviewMetricAvailabilityEnum get availability;
  // enum availabilityEnum {  available,  unavailable,  };

  @BuiltValueField(wireName: r'reason')
  String? get reason;

  @BuiltValueField(wireName: r'source')
  String get source_;

  @BuiltValueField(wireName: r'definition')
  String get definition;

  @BuiltValueField(wireName: r'unit')
  OverviewMetricUnitEnum get unit;
  // enum unitEnum {  count,  ratio,  };

  OverviewMetric._();

  factory OverviewMetric([void updates(OverviewMetricBuilder b)]) = _$OverviewMetric;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(OverviewMetricBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<OverviewMetric> get serializer => _$OverviewMetricSerializer();
}

class _$OverviewMetricSerializer implements PrimitiveSerializer<OverviewMetric> {
  @override
  final Iterable<Type> types = const [OverviewMetric, _$OverviewMetric];

  @override
  final String wireName = r'OverviewMetric';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    OverviewMetric object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    yield r'value';
    yield object.value == null ? null : serializers.serialize(
      object.value,
      specifiedType: const FullType.nullable(num),
    );
    yield r'previous';
    yield object.previous == null ? null : serializers.serialize(
      object.previous,
      specifiedType: const FullType.nullable(num),
    );
    yield r'changePercent';
    yield object.changePercent == null ? null : serializers.serialize(
      object.changePercent,
      specifiedType: const FullType.nullable(num),
    );
    yield r'availability';
    yield serializers.serialize(
      object.availability,
      specifiedType: const FullType(OverviewMetricAvailabilityEnum),
    );
    yield r'reason';
    yield object.reason == null ? null : serializers.serialize(
      object.reason,
      specifiedType: const FullType.nullable(String),
    );
    yield r'source';
    yield serializers.serialize(
      object.source_,
      specifiedType: const FullType(String),
    );
    yield r'definition';
    yield serializers.serialize(
      object.definition,
      specifiedType: const FullType(String),
    );
    yield r'unit';
    yield serializers.serialize(
      object.unit,
      specifiedType: const FullType(OverviewMetricUnitEnum),
    );
  }

  @override
  Object serialize(
    Serializers serializers,
    OverviewMetric object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required OverviewMetricBuilder result,
    required List<Object?> unhandled,
  }) {
    for (var i = 0; i < serializedList.length; i += 2) {
      final key = serializedList[i] as String;
      final value = serializedList[i + 1];
      switch (key) {
        case r'value':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType.nullable(num),
          ) as num?;
          if (valueDes == null) continue;
          result.value = valueDes;
          break;
        case r'previous':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType.nullable(num),
          ) as num?;
          if (valueDes == null) continue;
          result.previous = valueDes;
          break;
        case r'changePercent':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType.nullable(num),
          ) as num?;
          if (valueDes == null) continue;
          result.changePercent = valueDes;
          break;
        case r'availability':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(OverviewMetricAvailabilityEnum),
          ) as OverviewMetricAvailabilityEnum;
          result.availability = valueDes;
          break;
        case r'reason':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType.nullable(String),
          ) as String?;
          if (valueDes == null) continue;
          result.reason = valueDes;
          break;
        case r'source':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.source_ = valueDes;
          break;
        case r'definition':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.definition = valueDes;
          break;
        case r'unit':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(OverviewMetricUnitEnum),
          ) as OverviewMetricUnitEnum;
          result.unit = valueDes;
          break;
        default:
          unhandled.add(key);
          unhandled.add(value);
          break;
      }
    }
  }

  @override
  OverviewMetric deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = OverviewMetricBuilder();
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

class OverviewMetricAvailabilityEnum extends EnumClass {

  @BuiltValueEnumConst(wireName: r'available')
  static const OverviewMetricAvailabilityEnum available = _$overviewMetricAvailabilityEnum_available;
  @BuiltValueEnumConst(wireName: r'unavailable')
  static const OverviewMetricAvailabilityEnum unavailable = _$overviewMetricAvailabilityEnum_unavailable;

  static Serializer<OverviewMetricAvailabilityEnum> get serializer => _$overviewMetricAvailabilityEnumSerializer;

  const OverviewMetricAvailabilityEnum._(String name): super(name);

  static BuiltSet<OverviewMetricAvailabilityEnum> get values => _$overviewMetricAvailabilityEnumValues;
  static OverviewMetricAvailabilityEnum valueOf(String name) => _$overviewMetricAvailabilityEnumValueOf(name);
}

class OverviewMetricUnitEnum extends EnumClass {

  @BuiltValueEnumConst(wireName: r'count')
  static const OverviewMetricUnitEnum count = _$overviewMetricUnitEnum_count;
  @BuiltValueEnumConst(wireName: r'ratio')
  static const OverviewMetricUnitEnum ratio = _$overviewMetricUnitEnum_ratio;

  static Serializer<OverviewMetricUnitEnum> get serializer => _$overviewMetricUnitEnumSerializer;

  const OverviewMetricUnitEnum._(String name): super(name);

  static BuiltSet<OverviewMetricUnitEnum> get values => _$overviewMetricUnitEnumValues;
  static OverviewMetricUnitEnum valueOf(String name) => _$overviewMetricUnitEnumValueOf(name);
}
