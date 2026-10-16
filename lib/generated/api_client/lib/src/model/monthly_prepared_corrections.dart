//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:lythaus_api_client/src/model/monthly_prepared_source_correction.dart';
import 'package:built_collection/built_collection.dart';
import 'package:lythaus_api_client/src/model/monthly_prepared_snapshot_correction.dart';
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'monthly_prepared_corrections.g.dart';

/// MonthlyPreparedCorrections
///
/// Properties:
/// * [sourceRevisions]
/// * [effectiveSnapshots]
@BuiltValue()
abstract class MonthlyPreparedCorrections implements Built<MonthlyPreparedCorrections, MonthlyPreparedCorrectionsBuilder> {
  @BuiltValueField(wireName: r'sourceRevisions')
  BuiltList<MonthlyPreparedSourceCorrection> get sourceRevisions;

  @BuiltValueField(wireName: r'effectiveSnapshots')
  BuiltList<MonthlyPreparedSnapshotCorrection?> get effectiveSnapshots;

  MonthlyPreparedCorrections._();

  factory MonthlyPreparedCorrections([void updates(MonthlyPreparedCorrectionsBuilder b)]) = _$MonthlyPreparedCorrections;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(MonthlyPreparedCorrectionsBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<MonthlyPreparedCorrections> get serializer => _$MonthlyPreparedCorrectionsSerializer();
}

class _$MonthlyPreparedCorrectionsSerializer implements PrimitiveSerializer<MonthlyPreparedCorrections> {
  @override
  final Iterable<Type> types = const [MonthlyPreparedCorrections, _$MonthlyPreparedCorrections];

  @override
  final String wireName = r'MonthlyPreparedCorrections';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    MonthlyPreparedCorrections object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    yield r'sourceRevisions';
    yield serializers.serialize(
      object.sourceRevisions,
      specifiedType: const FullType(BuiltList, [FullType(MonthlyPreparedSourceCorrection)]),
    );
    yield r'effectiveSnapshots';
    yield serializers.serialize(
      object.effectiveSnapshots,
      specifiedType: const FullType(BuiltList, [FullType.nullable(MonthlyPreparedSnapshotCorrection)]),
    );
  }

  @override
  Object serialize(
    Serializers serializers,
    MonthlyPreparedCorrections object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required MonthlyPreparedCorrectionsBuilder result,
    required List<Object?> unhandled,
  }) {
    for (var i = 0; i < serializedList.length; i += 2) {
      final key = serializedList[i] as String;
      final value = serializedList[i + 1];
      switch (key) {
        case r'sourceRevisions':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(BuiltList, [FullType(MonthlyPreparedSourceCorrection)]),
          ) as BuiltList<MonthlyPreparedSourceCorrection>;
          result.sourceRevisions.replace(valueDes);
          break;
        case r'effectiveSnapshots':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(BuiltList, [FullType.nullable(MonthlyPreparedSnapshotCorrection)]),
          ) as BuiltList<MonthlyPreparedSnapshotCorrection?>;
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
  MonthlyPreparedCorrections deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = MonthlyPreparedCorrectionsBuilder();
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
