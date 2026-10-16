//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:built_collection/built_collection.dart';
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'monthly_prepared_snapshot_correction.g.dart';

/// MonthlyPreparedSnapshotCorrection
///
/// Properties:
/// * [revision]
/// * [mode]
/// * [sourceRevision]
/// * [recordedAt]
/// * [sourceScore]
/// * [level]
@BuiltValue()
abstract class MonthlyPreparedSnapshotCorrection implements Built<MonthlyPreparedSnapshotCorrection, MonthlyPreparedSnapshotCorrectionBuilder> {
  @BuiltValueField(wireName: r'revision')
  int get revision;

  @BuiltValueField(wireName: r'mode')
  MonthlyPreparedSnapshotCorrectionModeEnum get mode;
  // enum modeEnum {  shadow,  };

  @BuiltValueField(wireName: r'sourceRevision')
  int get sourceRevision;

  @BuiltValueField(wireName: r'recordedAt')
  DateTime? get recordedAt;

  @BuiltValueField(wireName: r'sourceScore')
  int get sourceScore;

  @BuiltValueField(wireName: r'level')
  int get level;

  MonthlyPreparedSnapshotCorrection._();

  factory MonthlyPreparedSnapshotCorrection([void updates(MonthlyPreparedSnapshotCorrectionBuilder b)]) = _$MonthlyPreparedSnapshotCorrection;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(MonthlyPreparedSnapshotCorrectionBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<MonthlyPreparedSnapshotCorrection> get serializer => _$MonthlyPreparedSnapshotCorrectionSerializer();
}

class _$MonthlyPreparedSnapshotCorrectionSerializer implements PrimitiveSerializer<MonthlyPreparedSnapshotCorrection> {
  @override
  final Iterable<Type> types = const [MonthlyPreparedSnapshotCorrection, _$MonthlyPreparedSnapshotCorrection];

  @override
  final String wireName = r'MonthlyPreparedSnapshotCorrection';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    MonthlyPreparedSnapshotCorrection object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    yield r'revision';
    yield serializers.serialize(
      object.revision,
      specifiedType: const FullType(int),
    );
    yield r'mode';
    yield serializers.serialize(
      object.mode,
      specifiedType: const FullType(MonthlyPreparedSnapshotCorrectionModeEnum),
    );
    yield r'sourceRevision';
    yield serializers.serialize(
      object.sourceRevision,
      specifiedType: const FullType(int),
    );
    yield r'recordedAt';
    yield object.recordedAt == null ? null : serializers.serialize(
      object.recordedAt,
      specifiedType: const FullType.nullable(DateTime),
    );
    yield r'sourceScore';
    yield serializers.serialize(
      object.sourceScore,
      specifiedType: const FullType(int),
    );
    yield r'level';
    yield serializers.serialize(
      object.level,
      specifiedType: const FullType(int),
    );
  }

  @override
  Object serialize(
    Serializers serializers,
    MonthlyPreparedSnapshotCorrection object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required MonthlyPreparedSnapshotCorrectionBuilder result,
    required List<Object?> unhandled,
  }) {
    for (var i = 0; i < serializedList.length; i += 2) {
      final key = serializedList[i] as String;
      final value = serializedList[i + 1];
      switch (key) {
        case r'revision':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(int),
          ) as int;
          result.revision = valueDes;
          break;
        case r'mode':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(MonthlyPreparedSnapshotCorrectionModeEnum),
          ) as MonthlyPreparedSnapshotCorrectionModeEnum;
          result.mode = valueDes;
          break;
        case r'sourceRevision':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(int),
          ) as int;
          result.sourceRevision = valueDes;
          break;
        case r'recordedAt':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType.nullable(DateTime),
          ) as DateTime?;
          if (valueDes == null) continue;
          result.recordedAt = valueDes;
          break;
        case r'sourceScore':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(int),
          ) as int;
          result.sourceScore = valueDes;
          break;
        case r'level':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(int),
          ) as int;
          result.level = valueDes;
          break;
        default:
          unhandled.add(key);
          unhandled.add(value);
          break;
      }
    }
  }

  @override
  MonthlyPreparedSnapshotCorrection deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = MonthlyPreparedSnapshotCorrectionBuilder();
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

class MonthlyPreparedSnapshotCorrectionModeEnum extends EnumClass {

  @BuiltValueEnumConst(wireName: r'shadow')
  static const MonthlyPreparedSnapshotCorrectionModeEnum shadow = _$monthlyPreparedSnapshotCorrectionModeEnum_shadow;

  static Serializer<MonthlyPreparedSnapshotCorrectionModeEnum> get serializer => _$monthlyPreparedSnapshotCorrectionModeEnumSerializer;

  const MonthlyPreparedSnapshotCorrectionModeEnum._(String name): super(name);

  static BuiltSet<MonthlyPreparedSnapshotCorrectionModeEnum> get values => _$monthlyPreparedSnapshotCorrectionModeEnumValues;
  static MonthlyPreparedSnapshotCorrectionModeEnum valueOf(String name) => _$monthlyPreparedSnapshotCorrectionModeEnumValueOf(name);
}
