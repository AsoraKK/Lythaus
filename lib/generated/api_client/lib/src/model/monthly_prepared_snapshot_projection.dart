//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:built_collection/built_collection.dart';
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'monthly_prepared_snapshot_projection.g.dart';

/// Fixed source-month shadow snapshot for its following calendar month. Null unavailable values are preserved; no source score or unassessed level is invented. A corrected current report does not replace this projection.
///
/// Properties:
/// * [state]
/// * [reasonCode]
/// * [effectiveMonth]
/// * [sourceMonth]
/// * [sourceScore]
/// * [level]
/// * [sourceRevision]
/// * [snapshotRevision]
@BuiltValue()
abstract class MonthlyPreparedSnapshotProjection implements Built<MonthlyPreparedSnapshotProjection, MonthlyPreparedSnapshotProjectionBuilder> {
  @BuiltValueField(wireName: r'state')
  MonthlyPreparedSnapshotProjectionStateEnum get state;
  // enum stateEnum {  shadow,  pending,  unavailable,  };

  @BuiltValueField(wireName: r'reasonCode')
  String? get reasonCode;

  @BuiltValueField(wireName: r'effectiveMonth')
  String get effectiveMonth;

  @BuiltValueField(wireName: r'sourceMonth')
  String? get sourceMonth;

  @BuiltValueField(wireName: r'sourceScore')
  int? get sourceScore;

  @BuiltValueField(wireName: r'level')
  int? get level;

  @BuiltValueField(wireName: r'sourceRevision')
  int? get sourceRevision;

  @BuiltValueField(wireName: r'snapshotRevision')
  int? get snapshotRevision;

  MonthlyPreparedSnapshotProjection._();

  factory MonthlyPreparedSnapshotProjection([void updates(MonthlyPreparedSnapshotProjectionBuilder b)]) = _$MonthlyPreparedSnapshotProjection;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(MonthlyPreparedSnapshotProjectionBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<MonthlyPreparedSnapshotProjection> get serializer => _$MonthlyPreparedSnapshotProjectionSerializer();
}

class _$MonthlyPreparedSnapshotProjectionSerializer implements PrimitiveSerializer<MonthlyPreparedSnapshotProjection> {
  @override
  final Iterable<Type> types = const [MonthlyPreparedSnapshotProjection, _$MonthlyPreparedSnapshotProjection];

  @override
  final String wireName = r'MonthlyPreparedSnapshotProjection';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    MonthlyPreparedSnapshotProjection object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    yield r'state';
    yield serializers.serialize(
      object.state,
      specifiedType: const FullType(MonthlyPreparedSnapshotProjectionStateEnum),
    );
    yield r'reasonCode';
    yield object.reasonCode == null ? null : serializers.serialize(
      object.reasonCode,
      specifiedType: const FullType.nullable(String),
    );
    yield r'effectiveMonth';
    yield serializers.serialize(
      object.effectiveMonth,
      specifiedType: const FullType(String),
    );
    yield r'sourceMonth';
    yield object.sourceMonth == null ? null : serializers.serialize(
      object.sourceMonth,
      specifiedType: const FullType.nullable(String),
    );
    yield r'sourceScore';
    yield object.sourceScore == null ? null : serializers.serialize(
      object.sourceScore,
      specifiedType: const FullType.nullable(int),
    );
    yield r'level';
    yield object.level == null ? null : serializers.serialize(
      object.level,
      specifiedType: const FullType.nullable(int),
    );
    yield r'sourceRevision';
    yield object.sourceRevision == null ? null : serializers.serialize(
      object.sourceRevision,
      specifiedType: const FullType.nullable(int),
    );
    yield r'snapshotRevision';
    yield object.snapshotRevision == null ? null : serializers.serialize(
      object.snapshotRevision,
      specifiedType: const FullType.nullable(int),
    );
  }

  @override
  Object serialize(
    Serializers serializers,
    MonthlyPreparedSnapshotProjection object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required MonthlyPreparedSnapshotProjectionBuilder result,
    required List<Object?> unhandled,
  }) {
    for (var i = 0; i < serializedList.length; i += 2) {
      final key = serializedList[i] as String;
      final value = serializedList[i + 1];
      switch (key) {
        case r'state':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(MonthlyPreparedSnapshotProjectionStateEnum),
          ) as MonthlyPreparedSnapshotProjectionStateEnum;
          result.state = valueDes;
          break;
        case r'reasonCode':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType.nullable(String),
          ) as String?;
          if (valueDes == null) continue;
          result.reasonCode = valueDes;
          break;
        case r'effectiveMonth':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.effectiveMonth = valueDes;
          break;
        case r'sourceMonth':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType.nullable(String),
          ) as String?;
          if (valueDes == null) continue;
          result.sourceMonth = valueDes;
          break;
        case r'sourceScore':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType.nullable(int),
          ) as int?;
          if (valueDes == null) continue;
          result.sourceScore = valueDes;
          break;
        case r'level':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType.nullable(int),
          ) as int?;
          if (valueDes == null) continue;
          result.level = valueDes;
          break;
        case r'sourceRevision':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType.nullable(int),
          ) as int?;
          if (valueDes == null) continue;
          result.sourceRevision = valueDes;
          break;
        case r'snapshotRevision':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType.nullable(int),
          ) as int?;
          if (valueDes == null) continue;
          result.snapshotRevision = valueDes;
          break;
        default:
          unhandled.add(key);
          unhandled.add(value);
          break;
      }
    }
  }

  @override
  MonthlyPreparedSnapshotProjection deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = MonthlyPreparedSnapshotProjectionBuilder();
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

class MonthlyPreparedSnapshotProjectionStateEnum extends EnumClass {

  @BuiltValueEnumConst(wireName: r'shadow')
  static const MonthlyPreparedSnapshotProjectionStateEnum shadow = _$monthlyPreparedSnapshotProjectionStateEnum_shadow;
  @BuiltValueEnumConst(wireName: r'pending')
  static const MonthlyPreparedSnapshotProjectionStateEnum pending = _$monthlyPreparedSnapshotProjectionStateEnum_pending;
  @BuiltValueEnumConst(wireName: r'unavailable')
  static const MonthlyPreparedSnapshotProjectionStateEnum unavailable = _$monthlyPreparedSnapshotProjectionStateEnum_unavailable;

  static Serializer<MonthlyPreparedSnapshotProjectionStateEnum> get serializer => _$monthlyPreparedSnapshotProjectionStateEnumSerializer;

  const MonthlyPreparedSnapshotProjectionStateEnum._(String name): super(name);

  static BuiltSet<MonthlyPreparedSnapshotProjectionStateEnum> get values => _$monthlyPreparedSnapshotProjectionStateEnumValues;
  static MonthlyPreparedSnapshotProjectionStateEnum valueOf(String name) => _$monthlyPreparedSnapshotProjectionStateEnumValueOf(name);
}
