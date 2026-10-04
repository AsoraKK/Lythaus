//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:built_collection/built_collection.dart';
import 'package:built_value/json_object.dart';
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'monthly_rewards_me_response.g.dart';

/// MonthlyRewardsMeResponse
///
/// Properties:
/// * [state]
/// * [reasonCode]
/// * [effectiveMonth]
/// * [currentLevel]
/// * [sourceMonth]
/// * [sourceScore]
/// * [snapshot]
/// * [selection]
@BuiltValue()
abstract class MonthlyRewardsMeResponse implements Built<MonthlyRewardsMeResponse, MonthlyRewardsMeResponseBuilder> {
  @BuiltValueField(wireName: r'state')
  MonthlyRewardsMeResponseStateEnum get state;
  // enum stateEnum {  pending,  ready,  };

  @BuiltValueField(wireName: r'reasonCode')
  String? get reasonCode;

  @BuiltValueField(wireName: r'effectiveMonth')
  String? get effectiveMonth;

  @BuiltValueField(wireName: r'currentLevel')
  int? get currentLevel;

  @BuiltValueField(wireName: r'sourceMonth')
  String? get sourceMonth;

  @BuiltValueField(wireName: r'sourceScore')
  int? get sourceScore;

  @BuiltValueField(wireName: r'snapshot')
  BuiltMap<String, JsonObject?> get snapshot;

  @BuiltValueField(wireName: r'selection')
  BuiltMap<String, JsonObject?> get selection;

  MonthlyRewardsMeResponse._();

  factory MonthlyRewardsMeResponse([void updates(MonthlyRewardsMeResponseBuilder b)]) = _$MonthlyRewardsMeResponse;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(MonthlyRewardsMeResponseBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<MonthlyRewardsMeResponse> get serializer => _$MonthlyRewardsMeResponseSerializer();
}

class _$MonthlyRewardsMeResponseSerializer implements PrimitiveSerializer<MonthlyRewardsMeResponse> {
  @override
  final Iterable<Type> types = const [MonthlyRewardsMeResponse, _$MonthlyRewardsMeResponse];

  @override
  final String wireName = r'MonthlyRewardsMeResponse';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    MonthlyRewardsMeResponse object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    yield r'state';
    yield serializers.serialize(
      object.state,
      specifiedType: const FullType(MonthlyRewardsMeResponseStateEnum),
    );
    yield r'reasonCode';
    yield object.reasonCode == null ? null : serializers.serialize(
      object.reasonCode,
      specifiedType: const FullType.nullable(String),
    );
    yield r'effectiveMonth';
    yield object.effectiveMonth == null ? null : serializers.serialize(
      object.effectiveMonth,
      specifiedType: const FullType.nullable(String),
    );
    yield r'currentLevel';
    yield object.currentLevel == null ? null : serializers.serialize(
      object.currentLevel,
      specifiedType: const FullType.nullable(int),
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
    yield r'snapshot';
    yield serializers.serialize(
      object.snapshot,
      specifiedType: const FullType(BuiltMap, [FullType(String), FullType.nullable(JsonObject)]),
    );
    yield r'selection';
    yield serializers.serialize(
      object.selection,
      specifiedType: const FullType(BuiltMap, [FullType(String), FullType.nullable(JsonObject)]),
    );
  }

  @override
  Object serialize(
    Serializers serializers,
    MonthlyRewardsMeResponse object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required MonthlyRewardsMeResponseBuilder result,
    required List<Object?> unhandled,
  }) {
    for (var i = 0; i < serializedList.length; i += 2) {
      final key = serializedList[i] as String;
      final value = serializedList[i + 1];
      switch (key) {
        case r'state':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(MonthlyRewardsMeResponseStateEnum),
          ) as MonthlyRewardsMeResponseStateEnum;
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
            specifiedType: const FullType.nullable(String),
          ) as String?;
          if (valueDes == null) continue;
          result.effectiveMonth = valueDes;
          break;
        case r'currentLevel':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType.nullable(int),
          ) as int?;
          if (valueDes == null) continue;
          result.currentLevel = valueDes;
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
        case r'snapshot':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(BuiltMap, [FullType(String), FullType.nullable(JsonObject)]),
          ) as BuiltMap<String, JsonObject?>;
          result.snapshot.replace(valueDes);
          break;
        case r'selection':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(BuiltMap, [FullType(String), FullType.nullable(JsonObject)]),
          ) as BuiltMap<String, JsonObject?>;
          result.selection.replace(valueDes);
          break;
        default:
          unhandled.add(key);
          unhandled.add(value);
          break;
      }
    }
  }

  @override
  MonthlyRewardsMeResponse deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = MonthlyRewardsMeResponseBuilder();
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

class MonthlyRewardsMeResponseStateEnum extends EnumClass {

  @BuiltValueEnumConst(wireName: r'pending')
  static const MonthlyRewardsMeResponseStateEnum pending = _$monthlyRewardsMeResponseStateEnum_pending;
  @BuiltValueEnumConst(wireName: r'ready')
  static const MonthlyRewardsMeResponseStateEnum ready = _$monthlyRewardsMeResponseStateEnum_ready;

  static Serializer<MonthlyRewardsMeResponseStateEnum> get serializer => _$monthlyRewardsMeResponseStateEnumSerializer;

  const MonthlyRewardsMeResponseStateEnum._(String name): super(name);

  static BuiltSet<MonthlyRewardsMeResponseStateEnum> get values => _$monthlyRewardsMeResponseStateEnumValues;
  static MonthlyRewardsMeResponseStateEnum valueOf(String name) => _$monthlyRewardsMeResponseStateEnumValueOf(name);
}
