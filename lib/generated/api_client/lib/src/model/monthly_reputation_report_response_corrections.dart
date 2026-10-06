//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:built_collection/built_collection.dart';
import 'package:built_value/json_object.dart';
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'monthly_reputation_report_response_corrections.g.dart';

/// MonthlyReputationReportResponseCorrections
///
/// Properties:
/// * [sourceRevisions]
/// * [effectiveSnapshots]
@BuiltValue()
abstract class MonthlyReputationReportResponseCorrections implements Built<MonthlyReputationReportResponseCorrections, MonthlyReputationReportResponseCorrectionsBuilder> {
  @BuiltValueField(wireName: r'sourceRevisions')
  BuiltList<BuiltMap<String, JsonObject?>> get sourceRevisions;

  @BuiltValueField(wireName: r'effectiveSnapshots')
  BuiltList<BuiltMap<String, JsonObject?>> get effectiveSnapshots;

  MonthlyReputationReportResponseCorrections._();

  factory MonthlyReputationReportResponseCorrections([void updates(MonthlyReputationReportResponseCorrectionsBuilder b)]) = _$MonthlyReputationReportResponseCorrections;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(MonthlyReputationReportResponseCorrectionsBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<MonthlyReputationReportResponseCorrections> get serializer => _$MonthlyReputationReportResponseCorrectionsSerializer();
}

class _$MonthlyReputationReportResponseCorrectionsSerializer implements PrimitiveSerializer<MonthlyReputationReportResponseCorrections> {
  @override
  final Iterable<Type> types = const [MonthlyReputationReportResponseCorrections, _$MonthlyReputationReportResponseCorrections];

  @override
  final String wireName = r'MonthlyReputationReportResponseCorrections';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    MonthlyReputationReportResponseCorrections object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    yield r'sourceRevisions';
    yield serializers.serialize(
      object.sourceRevisions,
      specifiedType: const FullType(BuiltList, [FullType(BuiltMap, [FullType(String), FullType.nullable(JsonObject)])]),
    );
    yield r'effectiveSnapshots';
    yield serializers.serialize(
      object.effectiveSnapshots,
      specifiedType: const FullType(BuiltList, [FullType(BuiltMap, [FullType(String), FullType.nullable(JsonObject)])]),
    );
  }

  @override
  Object serialize(
    Serializers serializers,
    MonthlyReputationReportResponseCorrections object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required MonthlyReputationReportResponseCorrectionsBuilder result,
    required List<Object?> unhandled,
  }) {
    for (var i = 0; i < serializedList.length; i += 2) {
      final key = serializedList[i] as String;
      final value = serializedList[i + 1];
      switch (key) {
        case r'sourceRevisions':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(BuiltList, [FullType(BuiltMap, [FullType(String), FullType.nullable(JsonObject)])]),
          ) as BuiltList<BuiltMap<String, JsonObject?>>;
          result.sourceRevisions.replace(valueDes);
          break;
        case r'effectiveSnapshots':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(BuiltList, [FullType(BuiltMap, [FullType(String), FullType.nullable(JsonObject)])]),
          ) as BuiltList<BuiltMap<String, JsonObject?>>;
          result.effectiveSnapshots.replace(valueDes);
          break;
        default:
          unhandled.add(key);
          unhandled.add(value);
          break;
      }
    }
  }

  @override
  MonthlyReputationReportResponseCorrections deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = MonthlyReputationReportResponseCorrectionsBuilder();
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
