//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'monthly_prepared_source_correction.g.dart';

/// MonthlyPreparedSourceCorrection
///
/// Properties:
/// * [sourceRevision]
/// * [reasonCode]
/// * [recordedAt]
/// * [sourceScore]
/// * [level]
@BuiltValue()
abstract class MonthlyPreparedSourceCorrection implements Built<MonthlyPreparedSourceCorrection, MonthlyPreparedSourceCorrectionBuilder> {
  @BuiltValueField(wireName: r'sourceRevision')
  int get sourceRevision;

  @BuiltValueField(wireName: r'reasonCode')
  String? get reasonCode;

  @BuiltValueField(wireName: r'recordedAt')
  DateTime? get recordedAt;

  @BuiltValueField(wireName: r'sourceScore')
  int? get sourceScore;

  @BuiltValueField(wireName: r'level')
  int? get level;

  MonthlyPreparedSourceCorrection._();

  factory MonthlyPreparedSourceCorrection([void updates(MonthlyPreparedSourceCorrectionBuilder b)]) = _$MonthlyPreparedSourceCorrection;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(MonthlyPreparedSourceCorrectionBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<MonthlyPreparedSourceCorrection> get serializer => _$MonthlyPreparedSourceCorrectionSerializer();
}

class _$MonthlyPreparedSourceCorrectionSerializer implements PrimitiveSerializer<MonthlyPreparedSourceCorrection> {
  @override
  final Iterable<Type> types = const [MonthlyPreparedSourceCorrection, _$MonthlyPreparedSourceCorrection];

  @override
  final String wireName = r'MonthlyPreparedSourceCorrection';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    MonthlyPreparedSourceCorrection object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    yield r'sourceRevision';
    yield serializers.serialize(
      object.sourceRevision,
      specifiedType: const FullType(int),
    );
    yield r'reasonCode';
    yield object.reasonCode == null ? null : serializers.serialize(
      object.reasonCode,
      specifiedType: const FullType.nullable(String),
    );
    yield r'recordedAt';
    yield object.recordedAt == null ? null : serializers.serialize(
      object.recordedAt,
      specifiedType: const FullType.nullable(DateTime),
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
  }

  @override
  Object serialize(
    Serializers serializers,
    MonthlyPreparedSourceCorrection object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required MonthlyPreparedSourceCorrectionBuilder result,
    required List<Object?> unhandled,
  }) {
    for (var i = 0; i < serializedList.length; i += 2) {
      final key = serializedList[i] as String;
      final value = serializedList[i + 1];
      switch (key) {
        case r'sourceRevision':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(int),
          ) as int;
          result.sourceRevision = valueDes;
          break;
        case r'reasonCode':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType.nullable(String),
          ) as String?;
          if (valueDes == null) continue;
          result.reasonCode = valueDes;
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
        default:
          unhandled.add(key);
          unhandled.add(value);
          break;
      }
    }
  }

  @override
  MonthlyPreparedSourceCorrection deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = MonthlyPreparedSourceCorrectionBuilder();
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
