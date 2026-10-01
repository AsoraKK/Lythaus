//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:built_collection/built_collection.dart';
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'alpha_component.g.dart';

/// AlphaComponent
///
/// Properties:
/// * [execution]
/// * [interpretation]
/// * [requested]
/// * [reason]
@BuiltValue()
abstract class AlphaComponent implements Built<AlphaComponent, AlphaComponentBuilder> {
  @BuiltValueField(wireName: r'execution')
  AlphaComponentExecutionEnum get execution;
  // enum executionEnum {  not_requested,  queued,  running,  completed,  skipped,  unsupported,  failed,  timed_out,  };

  @BuiltValueField(wireName: r'interpretation')
  AlphaComponentInterpretationEnum get interpretation;
  // enum interpretationEnum {  not_requested,  available,  inconclusive,  unavailable,  };

  @BuiltValueField(wireName: r'requested')
  bool get requested;

  @BuiltValueField(wireName: r'reason')
  String? get reason;

  AlphaComponent._();

  factory AlphaComponent([void updates(AlphaComponentBuilder b)]) = _$AlphaComponent;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(AlphaComponentBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<AlphaComponent> get serializer => _$AlphaComponentSerializer();
}

class _$AlphaComponentSerializer implements PrimitiveSerializer<AlphaComponent> {
  @override
  final Iterable<Type> types = const [AlphaComponent, _$AlphaComponent];

  @override
  final String wireName = r'AlphaComponent';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    AlphaComponent object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    yield r'execution';
    yield serializers.serialize(
      object.execution,
      specifiedType: const FullType(AlphaComponentExecutionEnum),
    );
    yield r'interpretation';
    yield serializers.serialize(
      object.interpretation,
      specifiedType: const FullType(AlphaComponentInterpretationEnum),
    );
    yield r'requested';
    yield serializers.serialize(
      object.requested,
      specifiedType: const FullType(bool),
    );
    if (object.reason != null) {
      yield r'reason';
      yield serializers.serialize(
        object.reason,
        specifiedType: const FullType(String),
      );
    }
  }

  @override
  Object serialize(
    Serializers serializers,
    AlphaComponent object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required AlphaComponentBuilder result,
    required List<Object?> unhandled,
  }) {
    for (var i = 0; i < serializedList.length; i += 2) {
      final key = serializedList[i] as String;
      final value = serializedList[i + 1];
      switch (key) {
        case r'execution':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(AlphaComponentExecutionEnum),
          ) as AlphaComponentExecutionEnum;
          result.execution = valueDes;
          break;
        case r'interpretation':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(AlphaComponentInterpretationEnum),
          ) as AlphaComponentInterpretationEnum;
          result.interpretation = valueDes;
          break;
        case r'requested':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(bool),
          ) as bool;
          result.requested = valueDes;
          break;
        case r'reason':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
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
  AlphaComponent deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = AlphaComponentBuilder();
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

class AlphaComponentExecutionEnum extends EnumClass {

  @BuiltValueEnumConst(wireName: r'not_requested')
  static const AlphaComponentExecutionEnum notRequested = _$alphaComponentExecutionEnum_notRequested;
  @BuiltValueEnumConst(wireName: r'queued')
  static const AlphaComponentExecutionEnum queued = _$alphaComponentExecutionEnum_queued;
  @BuiltValueEnumConst(wireName: r'running')
  static const AlphaComponentExecutionEnum running = _$alphaComponentExecutionEnum_running;
  @BuiltValueEnumConst(wireName: r'completed')
  static const AlphaComponentExecutionEnum completed = _$alphaComponentExecutionEnum_completed;
  @BuiltValueEnumConst(wireName: r'skipped')
  static const AlphaComponentExecutionEnum skipped = _$alphaComponentExecutionEnum_skipped;
  @BuiltValueEnumConst(wireName: r'unsupported')
  static const AlphaComponentExecutionEnum unsupported = _$alphaComponentExecutionEnum_unsupported;
  @BuiltValueEnumConst(wireName: r'failed')
  static const AlphaComponentExecutionEnum failed = _$alphaComponentExecutionEnum_failed;
  @BuiltValueEnumConst(wireName: r'timed_out')
  static const AlphaComponentExecutionEnum timedOut = _$alphaComponentExecutionEnum_timedOut;

  static Serializer<AlphaComponentExecutionEnum> get serializer => _$alphaComponentExecutionEnumSerializer;

  const AlphaComponentExecutionEnum._(String name): super(name);

  static BuiltSet<AlphaComponentExecutionEnum> get values => _$alphaComponentExecutionEnumValues;
  static AlphaComponentExecutionEnum valueOf(String name) => _$alphaComponentExecutionEnumValueOf(name);
}

class AlphaComponentInterpretationEnum extends EnumClass {

  @BuiltValueEnumConst(wireName: r'not_requested')
  static const AlphaComponentInterpretationEnum notRequested = _$alphaComponentInterpretationEnum_notRequested;
  @BuiltValueEnumConst(wireName: r'available')
  static const AlphaComponentInterpretationEnum available = _$alphaComponentInterpretationEnum_available;
  @BuiltValueEnumConst(wireName: r'inconclusive')
  static const AlphaComponentInterpretationEnum inconclusive = _$alphaComponentInterpretationEnum_inconclusive;
  @BuiltValueEnumConst(wireName: r'unavailable')
  static const AlphaComponentInterpretationEnum unavailable = _$alphaComponentInterpretationEnum_unavailable;

  static Serializer<AlphaComponentInterpretationEnum> get serializer => _$alphaComponentInterpretationEnumSerializer;

  const AlphaComponentInterpretationEnum._(String name): super(name);

  static BuiltSet<AlphaComponentInterpretationEnum> get values => _$alphaComponentInterpretationEnumValues;
  static AlphaComponentInterpretationEnum valueOf(String name) => _$alphaComponentInterpretationEnumValueOf(name);
}
