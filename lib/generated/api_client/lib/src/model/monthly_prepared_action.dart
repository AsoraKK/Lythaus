//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:built_collection/built_collection.dart';
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'monthly_prepared_action.g.dart';

/// MonthlyPreparedAction
///
/// Properties:
/// * [actionId]
/// * [capGroup]
/// * [allowance]
/// * [remainingInGroup]
/// * [points]
/// * [accepted]
/// * [pending]
/// * [withheld]
/// * [state]
/// * [reasonCode]
/// * [evidenceCount]
/// * [validFrom]
/// * [validUntil]
/// * [policyVersion]
/// * [dataVersion]
@BuiltValue()
abstract class MonthlyPreparedAction implements Built<MonthlyPreparedAction, MonthlyPreparedActionBuilder> {
  @BuiltValueField(wireName: r'actionId')
  String get actionId;

  @BuiltValueField(wireName: r'capGroup')
  String? get capGroup;

  @BuiltValueField(wireName: r'allowance')
  int? get allowance;

  @BuiltValueField(wireName: r'remainingInGroup')
  int? get remainingInGroup;

  @BuiltValueField(wireName: r'points')
  int get points;

  @BuiltValueField(wireName: r'accepted')
  int? get accepted;

  @BuiltValueField(wireName: r'pending')
  int? get pending;

  @BuiltValueField(wireName: r'withheld')
  int? get withheld;

  @BuiltValueField(wireName: r'state')
  String? get state;

  @BuiltValueField(wireName: r'reasonCode')
  String? get reasonCode;

  @BuiltValueField(wireName: r'evidenceCount')
  int get evidenceCount;

  @BuiltValueField(wireName: r'validFrom')
  DateTime? get validFrom;

  @BuiltValueField(wireName: r'validUntil')
  DateTime? get validUntil;

  @BuiltValueField(wireName: r'policyVersion')
  MonthlyPreparedActionPolicyVersionEnum get policyVersion;
  // enum policyVersionEnum {  lythaus-monthly-rewards-2026-10-v1,  };

  @BuiltValueField(wireName: r'dataVersion')
  int get dataVersion;

  MonthlyPreparedAction._();

  factory MonthlyPreparedAction([void updates(MonthlyPreparedActionBuilder b)]) = _$MonthlyPreparedAction;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(MonthlyPreparedActionBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<MonthlyPreparedAction> get serializer => _$MonthlyPreparedActionSerializer();
}

class _$MonthlyPreparedActionSerializer implements PrimitiveSerializer<MonthlyPreparedAction> {
  @override
  final Iterable<Type> types = const [MonthlyPreparedAction, _$MonthlyPreparedAction];

  @override
  final String wireName = r'MonthlyPreparedAction';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    MonthlyPreparedAction object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    yield r'actionId';
    yield serializers.serialize(
      object.actionId,
      specifiedType: const FullType(String),
    );
    yield r'capGroup';
    yield object.capGroup == null ? null : serializers.serialize(
      object.capGroup,
      specifiedType: const FullType.nullable(String),
    );
    yield r'allowance';
    yield object.allowance == null ? null : serializers.serialize(
      object.allowance,
      specifiedType: const FullType.nullable(int),
    );
    yield r'remainingInGroup';
    yield object.remainingInGroup == null ? null : serializers.serialize(
      object.remainingInGroup,
      specifiedType: const FullType.nullable(int),
    );
    yield r'points';
    yield serializers.serialize(
      object.points,
      specifiedType: const FullType(int),
    );
    yield r'accepted';
    yield object.accepted == null ? null : serializers.serialize(
      object.accepted,
      specifiedType: const FullType.nullable(int),
    );
    yield r'pending';
    yield object.pending == null ? null : serializers.serialize(
      object.pending,
      specifiedType: const FullType.nullable(int),
    );
    yield r'withheld';
    yield object.withheld == null ? null : serializers.serialize(
      object.withheld,
      specifiedType: const FullType.nullable(int),
    );
    yield r'state';
    yield object.state == null ? null : serializers.serialize(
      object.state,
      specifiedType: const FullType.nullable(String),
    );
    yield r'reasonCode';
    yield object.reasonCode == null ? null : serializers.serialize(
      object.reasonCode,
      specifiedType: const FullType.nullable(String),
    );
    yield r'evidenceCount';
    yield serializers.serialize(
      object.evidenceCount,
      specifiedType: const FullType(int),
    );
    yield r'validFrom';
    yield object.validFrom == null ? null : serializers.serialize(
      object.validFrom,
      specifiedType: const FullType.nullable(DateTime),
    );
    yield r'validUntil';
    yield object.validUntil == null ? null : serializers.serialize(
      object.validUntil,
      specifiedType: const FullType.nullable(DateTime),
    );
    yield r'policyVersion';
    yield serializers.serialize(
      object.policyVersion,
      specifiedType: const FullType(MonthlyPreparedActionPolicyVersionEnum),
    );
    yield r'dataVersion';
    yield serializers.serialize(
      object.dataVersion,
      specifiedType: const FullType(int),
    );
  }

  @override
  Object serialize(
    Serializers serializers,
    MonthlyPreparedAction object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required MonthlyPreparedActionBuilder result,
    required List<Object?> unhandled,
  }) {
    for (var i = 0; i < serializedList.length; i += 2) {
      final key = serializedList[i] as String;
      final value = serializedList[i + 1];
      switch (key) {
        case r'actionId':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.actionId = valueDes;
          break;
        case r'capGroup':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType.nullable(String),
          ) as String?;
          if (valueDes == null) continue;
          result.capGroup = valueDes;
          break;
        case r'allowance':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType.nullable(int),
          ) as int?;
          if (valueDes == null) continue;
          result.allowance = valueDes;
          break;
        case r'remainingInGroup':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType.nullable(int),
          ) as int?;
          if (valueDes == null) continue;
          result.remainingInGroup = valueDes;
          break;
        case r'points':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(int),
          ) as int;
          result.points = valueDes;
          break;
        case r'accepted':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType.nullable(int),
          ) as int?;
          if (valueDes == null) continue;
          result.accepted = valueDes;
          break;
        case r'pending':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType.nullable(int),
          ) as int?;
          if (valueDes == null) continue;
          result.pending = valueDes;
          break;
        case r'withheld':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType.nullable(int),
          ) as int?;
          if (valueDes == null) continue;
          result.withheld = valueDes;
          break;
        case r'state':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType.nullable(String),
          ) as String?;
          if (valueDes == null) continue;
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
        case r'evidenceCount':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(int),
          ) as int;
          result.evidenceCount = valueDes;
          break;
        case r'validFrom':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType.nullable(DateTime),
          ) as DateTime?;
          if (valueDes == null) continue;
          result.validFrom = valueDes;
          break;
        case r'validUntil':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType.nullable(DateTime),
          ) as DateTime?;
          if (valueDes == null) continue;
          result.validUntil = valueDes;
          break;
        case r'policyVersion':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(MonthlyPreparedActionPolicyVersionEnum),
          ) as MonthlyPreparedActionPolicyVersionEnum;
          result.policyVersion = valueDes;
          break;
        case r'dataVersion':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(int),
          ) as int;
          result.dataVersion = valueDes;
          break;
        default:
          unhandled.add(key);
          unhandled.add(value);
          break;
      }
    }
  }

  @override
  MonthlyPreparedAction deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = MonthlyPreparedActionBuilder();
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

class MonthlyPreparedActionPolicyVersionEnum extends EnumClass {

  @BuiltValueEnumConst(wireName: r'lythaus-monthly-rewards-2026-10-v1')
  static const MonthlyPreparedActionPolicyVersionEnum lythausMonthlyRewards202610V1 = _$monthlyPreparedActionPolicyVersionEnum_lythausMonthlyRewards202610V1;

  static Serializer<MonthlyPreparedActionPolicyVersionEnum> get serializer => _$monthlyPreparedActionPolicyVersionEnumSerializer;

  const MonthlyPreparedActionPolicyVersionEnum._(String name): super(name);

  static BuiltSet<MonthlyPreparedActionPolicyVersionEnum> get values => _$monthlyPreparedActionPolicyVersionEnumValues;
  static MonthlyPreparedActionPolicyVersionEnum valueOf(String name) => _$monthlyPreparedActionPolicyVersionEnumValueOf(name);
}
