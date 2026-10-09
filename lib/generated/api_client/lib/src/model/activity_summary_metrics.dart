//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:lythaus_api_client/src/model/activity_metric.dart';
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'activity_summary_metrics.g.dart';

/// ActivitySummaryMetrics
///
/// Properties:
/// * [dau]
/// * [wau]
/// * [mau]
/// * [quiet]
@BuiltValue()
abstract class ActivitySummaryMetrics implements Built<ActivitySummaryMetrics, ActivitySummaryMetricsBuilder> {
  @BuiltValueField(wireName: r'dau')
  ActivityMetric get dau;

  @BuiltValueField(wireName: r'wau')
  ActivityMetric get wau;

  @BuiltValueField(wireName: r'mau')
  ActivityMetric get mau;

  @BuiltValueField(wireName: r'quiet')
  ActivityMetric get quiet;

  ActivitySummaryMetrics._();

  factory ActivitySummaryMetrics([void updates(ActivitySummaryMetricsBuilder b)]) = _$ActivitySummaryMetrics;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(ActivitySummaryMetricsBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<ActivitySummaryMetrics> get serializer => _$ActivitySummaryMetricsSerializer();
}

class _$ActivitySummaryMetricsSerializer implements PrimitiveSerializer<ActivitySummaryMetrics> {
  @override
  final Iterable<Type> types = const [ActivitySummaryMetrics, _$ActivitySummaryMetrics];

  @override
  final String wireName = r'ActivitySummaryMetrics';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    ActivitySummaryMetrics object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    yield r'dau';
    yield serializers.serialize(
      object.dau,
      specifiedType: const FullType(ActivityMetric),
    );
    yield r'wau';
    yield serializers.serialize(
      object.wau,
      specifiedType: const FullType(ActivityMetric),
    );
    yield r'mau';
    yield serializers.serialize(
      object.mau,
      specifiedType: const FullType(ActivityMetric),
    );
    yield r'quiet';
    yield serializers.serialize(
      object.quiet,
      specifiedType: const FullType(ActivityMetric),
    );
  }

  @override
  Object serialize(
    Serializers serializers,
    ActivitySummaryMetrics object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required ActivitySummaryMetricsBuilder result,
    required List<Object?> unhandled,
  }) {
    for (var i = 0; i < serializedList.length; i += 2) {
      final key = serializedList[i] as String;
      final value = serializedList[i + 1];
      switch (key) {
        case r'dau':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(ActivityMetric),
          ) as ActivityMetric;
          result.dau.replace(valueDes);
          break;
        case r'wau':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(ActivityMetric),
          ) as ActivityMetric;
          result.wau.replace(valueDes);
          break;
        case r'mau':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(ActivityMetric),
          ) as ActivityMetric;
          result.mau.replace(valueDes);
          break;
        case r'quiet':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(ActivityMetric),
          ) as ActivityMetric;
          result.quiet.replace(valueDes);
          break;
        default:
          unhandled.add(key);
          unhandled.add(value);
          break;
      }
    }
  }

  @override
  ActivitySummaryMetrics deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = ActivitySummaryMetricsBuilder();
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
