//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:built_collection/built_collection.dart';
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'activity_metric.g.dart';

/// ActivityMetric
///
/// Properties:
/// * [state]
/// * [value]
/// * [observedLowerBound] - Positive observed active count only when coverage is incomplete. Never valid for quiet.
/// * [cohortSize]
/// * [since]
/// * [until] - Exclusive completed UTC-day boundary.
/// * [reason]
@BuiltValue()
abstract class ActivityMetric implements Built<ActivityMetric, ActivityMetricBuilder> {
  @BuiltValueField(wireName: r'state')
  ActivityMetricStateEnum get state;
  // enum stateEnum {  available,  partial,  unavailable,  };

  @BuiltValueField(wireName: r'value')
  int? get value;

  /// Positive observed active count only when coverage is incomplete. Never valid for quiet.
  @BuiltValueField(wireName: r'observedLowerBound')
  int? get observedLowerBound;

  @BuiltValueField(wireName: r'cohortSize')
  int? get cohortSize;

  @BuiltValueField(wireName: r'since')
  DateTime get since;

  /// Exclusive completed UTC-day boundary.
  @BuiltValueField(wireName: r'until')
  DateTime get until;

  @BuiltValueField(wireName: r'reason')
  String? get reason;

  ActivityMetric._();

  factory ActivityMetric([void updates(ActivityMetricBuilder b)]) = _$ActivityMetric;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(ActivityMetricBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<ActivityMetric> get serializer => _$ActivityMetricSerializer();
}

class _$ActivityMetricSerializer implements PrimitiveSerializer<ActivityMetric> {
  @override
  final Iterable<Type> types = const [ActivityMetric, _$ActivityMetric];

  @override
  final String wireName = r'ActivityMetric';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    ActivityMetric object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    yield r'state';
    yield serializers.serialize(
      object.state,
      specifiedType: const FullType(ActivityMetricStateEnum),
    );
    yield r'value';
    yield object.value == null ? null : serializers.serialize(
      object.value,
      specifiedType: const FullType.nullable(int),
    );
    yield r'observedLowerBound';
    yield object.observedLowerBound == null ? null : serializers.serialize(
      object.observedLowerBound,
      specifiedType: const FullType.nullable(int),
    );
    yield r'cohortSize';
    yield object.cohortSize == null ? null : serializers.serialize(
      object.cohortSize,
      specifiedType: const FullType.nullable(int),
    );
    yield r'since';
    yield serializers.serialize(
      object.since,
      specifiedType: const FullType(DateTime),
    );
    yield r'until';
    yield serializers.serialize(
      object.until,
      specifiedType: const FullType(DateTime),
    );
    yield r'reason';
    yield object.reason == null ? null : serializers.serialize(
      object.reason,
      specifiedType: const FullType.nullable(String),
    );
  }

  @override
  Object serialize(
    Serializers serializers,
    ActivityMetric object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required ActivityMetricBuilder result,
    required List<Object?> unhandled,
  }) {
    for (var i = 0; i < serializedList.length; i += 2) {
      final key = serializedList[i] as String;
      final value = serializedList[i + 1];
      switch (key) {
        case r'state':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(ActivityMetricStateEnum),
          ) as ActivityMetricStateEnum;
          result.state = valueDes;
          break;
        case r'value':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType.nullable(int),
          ) as int?;
          if (valueDes == null) continue;
          result.value = valueDes;
          break;
        case r'observedLowerBound':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType.nullable(int),
          ) as int?;
          if (valueDes == null) continue;
          result.observedLowerBound = valueDes;
          break;
        case r'cohortSize':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType.nullable(int),
          ) as int?;
          if (valueDes == null) continue;
          result.cohortSize = valueDes;
          break;
        case r'since':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(DateTime),
          ) as DateTime;
          result.since = valueDes;
          break;
        case r'until':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(DateTime),
          ) as DateTime;
          result.until = valueDes;
          break;
        case r'reason':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType.nullable(String),
          ) as String?;
          if (valueDes == null) continue;
          result.reason = valueDes;
          break;
        default:
          unhandled.add(key);
          unhandled.add(value);
          break;
      }
    }
  }

  @override
  ActivityMetric deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = ActivityMetricBuilder();
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

class ActivityMetricStateEnum extends EnumClass {

  @BuiltValueEnumConst(wireName: r'available')
  static const ActivityMetricStateEnum available = _$activityMetricStateEnum_available;
  @BuiltValueEnumConst(wireName: r'partial')
  static const ActivityMetricStateEnum partial = _$activityMetricStateEnum_partial;
  @BuiltValueEnumConst(wireName: r'unavailable')
  static const ActivityMetricStateEnum unavailable = _$activityMetricStateEnum_unavailable;

  static Serializer<ActivityMetricStateEnum> get serializer => _$activityMetricStateEnumSerializer;

  const ActivityMetricStateEnum._(String name): super(name);

  static BuiltSet<ActivityMetricStateEnum> get values => _$activityMetricStateEnumValues;
  static ActivityMetricStateEnum valueOf(String name) => _$activityMetricStateEnumValueOf(name);
}
