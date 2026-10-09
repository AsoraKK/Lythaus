//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:lythaus_api_client/src/model/monthly_prepared_unavailable_snapshot.dart';
import 'package:built_collection/built_collection.dart';
import 'package:lythaus_api_client/src/model/monthly_prepared_unavailable_selection.dart';
import 'package:lythaus_api_client/src/model/monthly_prepared_snapshot_projection.dart';
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'monthly_rewards_response_preparation.g.dart';

/// Disabled v2 rewards DTO for synthetic fixtures only. Current level, source score, confirmed snapshot and reward selection remain unavailable. A shadow snapshot projection is never live eligibility and cannot be recalculated from current progress.
///
/// Properties:
/// * [responseVersion]
/// * [policyVersion]
/// * [catalogueHash]
/// * [dataVersion]
/// * [preparationOnly]
/// * [runtimeActivationAllowed]
/// * [appliedPoints]
/// * [maximumSourceMonth]
/// * [responseKind]
/// * [state]
/// * [reasonCode]
/// * [effectiveMonth]
/// * [currentLevel]
/// * [sourceMonth]
/// * [sourceScore]
/// * [snapshot]
/// * [selection]
/// * [snapshotProjection]
@BuiltValue()
abstract class MonthlyRewardsResponsePreparation implements Built<MonthlyRewardsResponsePreparation, MonthlyRewardsResponsePreparationBuilder> {
  @BuiltValueField(wireName: r'responseVersion')
  MonthlyRewardsResponsePreparationResponseVersionEnum get responseVersion;
  // enum responseVersionEnum {  monthly-rewards-response-v2-preparation,  };

  @BuiltValueField(wireName: r'policyVersion')
  MonthlyRewardsResponsePreparationPolicyVersionEnum get policyVersion;
  // enum policyVersionEnum {  lythaus-monthly-rewards-2026-10-v2,  };

  @BuiltValueField(wireName: r'catalogueHash')
  String get catalogueHash;

  @BuiltValueField(wireName: r'dataVersion')
  int get dataVersion;

  @BuiltValueField(wireName: r'preparationOnly')
  bool get preparationOnly;

  @BuiltValueField(wireName: r'runtimeActivationAllowed')
  bool get runtimeActivationAllowed;

  @BuiltValueField(wireName: r'appliedPoints')
  int get appliedPoints;

  @BuiltValueField(wireName: r'maximumSourceMonth')
  int get maximumSourceMonth;

  @BuiltValueField(wireName: r'responseKind')
  MonthlyRewardsResponsePreparationResponseKindEnum get responseKind;
  // enum responseKindEnum {  monthly_rewards,  };

  @BuiltValueField(wireName: r'state')
  MonthlyRewardsResponsePreparationStateEnum get state;
  // enum stateEnum {  pending,  };

  @BuiltValueField(wireName: r'reasonCode')
  MonthlyRewardsResponsePreparationReasonCodeEnum get reasonCode;
  // enum reasonCodeEnum {  activation_not_approved,  };

  @BuiltValueField(wireName: r'effectiveMonth')
  String get effectiveMonth;

  @BuiltValueField(wireName: r'currentLevel')
  int? get currentLevel;

  @BuiltValueField(wireName: r'sourceMonth')
  String? get sourceMonth;

  @BuiltValueField(wireName: r'sourceScore')
  int? get sourceScore;

  @BuiltValueField(wireName: r'snapshot')
  MonthlyPreparedUnavailableSnapshot get snapshot;

  @BuiltValueField(wireName: r'selection')
  MonthlyPreparedUnavailableSelection get selection;

  @BuiltValueField(wireName: r'snapshotProjection')
  MonthlyPreparedSnapshotProjection? get snapshotProjection;

  MonthlyRewardsResponsePreparation._();

  factory MonthlyRewardsResponsePreparation([void updates(MonthlyRewardsResponsePreparationBuilder b)]) = _$MonthlyRewardsResponsePreparation;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(MonthlyRewardsResponsePreparationBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<MonthlyRewardsResponsePreparation> get serializer => _$MonthlyRewardsResponsePreparationSerializer();
}

class _$MonthlyRewardsResponsePreparationSerializer implements PrimitiveSerializer<MonthlyRewardsResponsePreparation> {
  @override
  final Iterable<Type> types = const [MonthlyRewardsResponsePreparation, _$MonthlyRewardsResponsePreparation];

  @override
  final String wireName = r'MonthlyRewardsResponsePreparation';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    MonthlyRewardsResponsePreparation object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    yield r'responseVersion';
    yield serializers.serialize(
      object.responseVersion,
      specifiedType: const FullType(MonthlyRewardsResponsePreparationResponseVersionEnum),
    );
    yield r'policyVersion';
    yield serializers.serialize(
      object.policyVersion,
      specifiedType: const FullType(MonthlyRewardsResponsePreparationPolicyVersionEnum),
    );
    yield r'catalogueHash';
    yield serializers.serialize(
      object.catalogueHash,
      specifiedType: const FullType(String),
    );
    yield r'dataVersion';
    yield serializers.serialize(
      object.dataVersion,
      specifiedType: const FullType(int),
    );
    yield r'preparationOnly';
    yield serializers.serialize(
      object.preparationOnly,
      specifiedType: const FullType(bool),
    );
    yield r'runtimeActivationAllowed';
    yield serializers.serialize(
      object.runtimeActivationAllowed,
      specifiedType: const FullType(bool),
    );
    yield r'appliedPoints';
    yield serializers.serialize(
      object.appliedPoints,
      specifiedType: const FullType(int),
    );
    yield r'maximumSourceMonth';
    yield serializers.serialize(
      object.maximumSourceMonth,
      specifiedType: const FullType(int),
    );
    yield r'responseKind';
    yield serializers.serialize(
      object.responseKind,
      specifiedType: const FullType(MonthlyRewardsResponsePreparationResponseKindEnum),
    );
    yield r'state';
    yield serializers.serialize(
      object.state,
      specifiedType: const FullType(MonthlyRewardsResponsePreparationStateEnum),
    );
    yield r'reasonCode';
    yield serializers.serialize(
      object.reasonCode,
      specifiedType: const FullType(MonthlyRewardsResponsePreparationReasonCodeEnum),
    );
    yield r'effectiveMonth';
    yield serializers.serialize(
      object.effectiveMonth,
      specifiedType: const FullType(String),
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
      specifiedType: const FullType(MonthlyPreparedUnavailableSnapshot),
    );
    yield r'selection';
    yield serializers.serialize(
      object.selection,
      specifiedType: const FullType(MonthlyPreparedUnavailableSelection),
    );
    yield r'snapshotProjection';
    yield object.snapshotProjection == null ? null : serializers.serialize(
      object.snapshotProjection,
      specifiedType: const FullType.nullable(MonthlyPreparedSnapshotProjection),
    );
  }

  @override
  Object serialize(
    Serializers serializers,
    MonthlyRewardsResponsePreparation object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required MonthlyRewardsResponsePreparationBuilder result,
    required List<Object?> unhandled,
  }) {
    for (var i = 0; i < serializedList.length; i += 2) {
      final key = serializedList[i] as String;
      final value = serializedList[i + 1];
      switch (key) {
        case r'responseVersion':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(MonthlyRewardsResponsePreparationResponseVersionEnum),
          ) as MonthlyRewardsResponsePreparationResponseVersionEnum;
          result.responseVersion = valueDes;
          break;
        case r'policyVersion':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(MonthlyRewardsResponsePreparationPolicyVersionEnum),
          ) as MonthlyRewardsResponsePreparationPolicyVersionEnum;
          result.policyVersion = valueDes;
          break;
        case r'catalogueHash':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.catalogueHash = valueDes;
          break;
        case r'dataVersion':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(int),
          ) as int;
          result.dataVersion = valueDes;
          break;
        case r'preparationOnly':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(bool),
          ) as bool;
          result.preparationOnly = valueDes;
          break;
        case r'runtimeActivationAllowed':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(bool),
          ) as bool;
          result.runtimeActivationAllowed = valueDes;
          break;
        case r'appliedPoints':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(int),
          ) as int;
          result.appliedPoints = valueDes;
          break;
        case r'maximumSourceMonth':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(int),
          ) as int;
          result.maximumSourceMonth = valueDes;
          break;
        case r'responseKind':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(MonthlyRewardsResponsePreparationResponseKindEnum),
          ) as MonthlyRewardsResponsePreparationResponseKindEnum;
          result.responseKind = valueDes;
          break;
        case r'state':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(MonthlyRewardsResponsePreparationStateEnum),
          ) as MonthlyRewardsResponsePreparationStateEnum;
          result.state = valueDes;
          break;
        case r'reasonCode':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(MonthlyRewardsResponsePreparationReasonCodeEnum),
          ) as MonthlyRewardsResponsePreparationReasonCodeEnum;
          result.reasonCode = valueDes;
          break;
        case r'effectiveMonth':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
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
            specifiedType: const FullType(MonthlyPreparedUnavailableSnapshot),
          ) as MonthlyPreparedUnavailableSnapshot;
          result.snapshot.replace(valueDes);
          break;
        case r'selection':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(MonthlyPreparedUnavailableSelection),
          ) as MonthlyPreparedUnavailableSelection;
          result.selection.replace(valueDes);
          break;
        case r'snapshotProjection':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType.nullable(MonthlyPreparedSnapshotProjection),
          ) as MonthlyPreparedSnapshotProjection?;
          if (valueDes == null) continue;
          result.snapshotProjection.replace(valueDes);
          break;
        default:
          unhandled.add(key);
          unhandled.add(value);
          break;
      }
    }
  }

  @override
  MonthlyRewardsResponsePreparation deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = MonthlyRewardsResponsePreparationBuilder();
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

class MonthlyRewardsResponsePreparationResponseVersionEnum extends EnumClass {

  @BuiltValueEnumConst(wireName: r'monthly-rewards-response-v2-preparation')
  static const MonthlyRewardsResponsePreparationResponseVersionEnum monthlyRewardsResponseV2Preparation = _$monthlyRewardsResponsePreparationResponseVersionEnum_monthlyRewardsResponseV2Preparation;

  static Serializer<MonthlyRewardsResponsePreparationResponseVersionEnum> get serializer => _$monthlyRewardsResponsePreparationResponseVersionEnumSerializer;

  const MonthlyRewardsResponsePreparationResponseVersionEnum._(String name): super(name);

  static BuiltSet<MonthlyRewardsResponsePreparationResponseVersionEnum> get values => _$monthlyRewardsResponsePreparationResponseVersionEnumValues;
  static MonthlyRewardsResponsePreparationResponseVersionEnum valueOf(String name) => _$monthlyRewardsResponsePreparationResponseVersionEnumValueOf(name);
}

class MonthlyRewardsResponsePreparationPolicyVersionEnum extends EnumClass {

  @BuiltValueEnumConst(wireName: r'lythaus-monthly-rewards-2026-10-v2')
  static const MonthlyRewardsResponsePreparationPolicyVersionEnum lythausMonthlyRewards202610V2 = _$monthlyRewardsResponsePreparationPolicyVersionEnum_lythausMonthlyRewards202610V2;

  static Serializer<MonthlyRewardsResponsePreparationPolicyVersionEnum> get serializer => _$monthlyRewardsResponsePreparationPolicyVersionEnumSerializer;

  const MonthlyRewardsResponsePreparationPolicyVersionEnum._(String name): super(name);

  static BuiltSet<MonthlyRewardsResponsePreparationPolicyVersionEnum> get values => _$monthlyRewardsResponsePreparationPolicyVersionEnumValues;
  static MonthlyRewardsResponsePreparationPolicyVersionEnum valueOf(String name) => _$monthlyRewardsResponsePreparationPolicyVersionEnumValueOf(name);
}

class MonthlyRewardsResponsePreparationResponseKindEnum extends EnumClass {

  @BuiltValueEnumConst(wireName: r'monthly_rewards')
  static const MonthlyRewardsResponsePreparationResponseKindEnum monthlyRewards = _$monthlyRewardsResponsePreparationResponseKindEnum_monthlyRewards;

  static Serializer<MonthlyRewardsResponsePreparationResponseKindEnum> get serializer => _$monthlyRewardsResponsePreparationResponseKindEnumSerializer;

  const MonthlyRewardsResponsePreparationResponseKindEnum._(String name): super(name);

  static BuiltSet<MonthlyRewardsResponsePreparationResponseKindEnum> get values => _$monthlyRewardsResponsePreparationResponseKindEnumValues;
  static MonthlyRewardsResponsePreparationResponseKindEnum valueOf(String name) => _$monthlyRewardsResponsePreparationResponseKindEnumValueOf(name);
}

class MonthlyRewardsResponsePreparationStateEnum extends EnumClass {

  @BuiltValueEnumConst(wireName: r'pending')
  static const MonthlyRewardsResponsePreparationStateEnum pending = _$monthlyRewardsResponsePreparationStateEnum_pending;

  static Serializer<MonthlyRewardsResponsePreparationStateEnum> get serializer => _$monthlyRewardsResponsePreparationStateEnumSerializer;

  const MonthlyRewardsResponsePreparationStateEnum._(String name): super(name);

  static BuiltSet<MonthlyRewardsResponsePreparationStateEnum> get values => _$monthlyRewardsResponsePreparationStateEnumValues;
  static MonthlyRewardsResponsePreparationStateEnum valueOf(String name) => _$monthlyRewardsResponsePreparationStateEnumValueOf(name);
}

class MonthlyRewardsResponsePreparationReasonCodeEnum extends EnumClass {

  @BuiltValueEnumConst(wireName: r'activation_not_approved')
  static const MonthlyRewardsResponsePreparationReasonCodeEnum activationNotApproved = _$monthlyRewardsResponsePreparationReasonCodeEnum_activationNotApproved;

  static Serializer<MonthlyRewardsResponsePreparationReasonCodeEnum> get serializer => _$monthlyRewardsResponsePreparationReasonCodeEnumSerializer;

  const MonthlyRewardsResponsePreparationReasonCodeEnum._(String name): super(name);

  static BuiltSet<MonthlyRewardsResponsePreparationReasonCodeEnum> get values => _$monthlyRewardsResponsePreparationReasonCodeEnumValues;
  static MonthlyRewardsResponsePreparationReasonCodeEnum valueOf(String name) => _$monthlyRewardsResponsePreparationReasonCodeEnumValueOf(name);
}
