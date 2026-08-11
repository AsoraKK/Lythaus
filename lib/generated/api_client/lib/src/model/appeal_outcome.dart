//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:built_collection/built_collection.dart';
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'appeal_outcome.g.dart';

/// AppealOutcome
///
/// Properties:
/// * [status]
/// * [reviewerPanelDecision]
/// * [finalDecision]
/// * [completedReviewers]
/// * [totalWeight]
/// * [overturnWeight]
/// * [upholdWeight]
/// * [winningShare]
/// * [requiredAdjudicators]
/// * [policyVersion]
@BuiltValue(instantiable: false)
abstract class AppealOutcome  {
  @BuiltValueField(wireName: r'status')
  AppealOutcomeStatusEnum get status;
  // enum statusEnum {  pending_quorum,  no_consensus,  pending_adjudication,  adjudication_disagreement,  resolved,  };

  @BuiltValueField(wireName: r'reviewerPanelDecision')
  AppealOutcomeReviewerPanelDecisionEnum? get reviewerPanelDecision;
  // enum reviewerPanelDecisionEnum {  overturn,  uphold,  };

  @BuiltValueField(wireName: r'finalDecision')
  AppealOutcomeFinalDecisionEnum? get finalDecision;
  // enum finalDecisionEnum {  overturn,  uphold,  };

  @BuiltValueField(wireName: r'completedReviewers')
  int get completedReviewers;

  @BuiltValueField(wireName: r'totalWeight')
  int get totalWeight;

  @BuiltValueField(wireName: r'overturnWeight')
  int get overturnWeight;

  @BuiltValueField(wireName: r'upholdWeight')
  int get upholdWeight;

  @BuiltValueField(wireName: r'winningShare')
  num get winningShare;

  @BuiltValueField(wireName: r'requiredAdjudicators')
  AppealOutcomeRequiredAdjudicatorsEnum get requiredAdjudicators;
  // enum requiredAdjudicatorsEnum {  1,  2,  };

  @BuiltValueField(wireName: r'policyVersion')
  String get policyVersion;

  @BuiltValueSerializer(custom: true)
  static Serializer<AppealOutcome> get serializer => _$AppealOutcomeSerializer();
}

class _$AppealOutcomeSerializer implements PrimitiveSerializer<AppealOutcome> {
  @override
  final Iterable<Type> types = const [AppealOutcome];

  @override
  final String wireName = r'AppealOutcome';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    AppealOutcome object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    yield r'status';
    yield serializers.serialize(
      object.status,
      specifiedType: const FullType(AppealOutcomeStatusEnum),
    );
    if (object.reviewerPanelDecision != null) {
      yield r'reviewerPanelDecision';
      yield serializers.serialize(
        object.reviewerPanelDecision,
        specifiedType: const FullType.nullable(AppealOutcomeReviewerPanelDecisionEnum),
      );
    }
    if (object.finalDecision != null) {
      yield r'finalDecision';
      yield serializers.serialize(
        object.finalDecision,
        specifiedType: const FullType.nullable(AppealOutcomeFinalDecisionEnum),
      );
    }
    yield r'completedReviewers';
    yield serializers.serialize(
      object.completedReviewers,
      specifiedType: const FullType(int),
    );
    yield r'totalWeight';
    yield serializers.serialize(
      object.totalWeight,
      specifiedType: const FullType(int),
    );
    yield r'overturnWeight';
    yield serializers.serialize(
      object.overturnWeight,
      specifiedType: const FullType(int),
    );
    yield r'upholdWeight';
    yield serializers.serialize(
      object.upholdWeight,
      specifiedType: const FullType(int),
    );
    yield r'winningShare';
    yield serializers.serialize(
      object.winningShare,
      specifiedType: const FullType(num),
    );
    yield r'requiredAdjudicators';
    yield serializers.serialize(
      object.requiredAdjudicators,
      specifiedType: const FullType(AppealOutcomeRequiredAdjudicatorsEnum),
    );
    yield r'policyVersion';
    yield serializers.serialize(
      object.policyVersion,
      specifiedType: const FullType(String),
    );
  }

  @override
  Object serialize(
    Serializers serializers,
    AppealOutcome object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  @override
  AppealOutcome deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return serializers.deserialize(serialized, specifiedType: FullType($AppealOutcome)) as $AppealOutcome;
  }
}

/// a concrete implementation of [AppealOutcome], since [AppealOutcome] is not instantiable
@BuiltValue(instantiable: true)
abstract class $AppealOutcome implements AppealOutcome, Built<$AppealOutcome, $AppealOutcomeBuilder> {
  $AppealOutcome._();

  factory $AppealOutcome([void Function($AppealOutcomeBuilder)? updates]) = _$$AppealOutcome;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults($AppealOutcomeBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<$AppealOutcome> get serializer => _$$AppealOutcomeSerializer();
}

class _$$AppealOutcomeSerializer implements PrimitiveSerializer<$AppealOutcome> {
  @override
  final Iterable<Type> types = const [$AppealOutcome, _$$AppealOutcome];

  @override
  final String wireName = r'$AppealOutcome';

  @override
  Object serialize(
    Serializers serializers,
    $AppealOutcome object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return serializers.serialize(object, specifiedType: FullType(AppealOutcome))!;
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required AppealOutcomeBuilder result,
    required List<Object?> unhandled,
  }) {
    for (var i = 0; i < serializedList.length; i += 2) {
      final key = serializedList[i] as String;
      final value = serializedList[i + 1];
      switch (key) {
        case r'status':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(AppealOutcomeStatusEnum),
          ) as AppealOutcomeStatusEnum;
          result.status = valueDes;
          break;
        case r'reviewerPanelDecision':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType.nullable(AppealOutcomeReviewerPanelDecisionEnum),
          ) as AppealOutcomeReviewerPanelDecisionEnum?;
          if (valueDes == null) continue;
          result.reviewerPanelDecision = valueDes;
          break;
        case r'finalDecision':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType.nullable(AppealOutcomeFinalDecisionEnum),
          ) as AppealOutcomeFinalDecisionEnum?;
          if (valueDes == null) continue;
          result.finalDecision = valueDes;
          break;
        case r'completedReviewers':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(int),
          ) as int;
          result.completedReviewers = valueDes;
          break;
        case r'totalWeight':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(int),
          ) as int;
          result.totalWeight = valueDes;
          break;
        case r'overturnWeight':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(int),
          ) as int;
          result.overturnWeight = valueDes;
          break;
        case r'upholdWeight':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(int),
          ) as int;
          result.upholdWeight = valueDes;
          break;
        case r'winningShare':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(num),
          ) as num;
          result.winningShare = valueDes;
          break;
        case r'requiredAdjudicators':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(AppealOutcomeRequiredAdjudicatorsEnum),
          ) as AppealOutcomeRequiredAdjudicatorsEnum;
          result.requiredAdjudicators = valueDes;
          break;
        case r'policyVersion':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.policyVersion = valueDes;
          break;
        default:
          unhandled.add(key);
          unhandled.add(value);
          break;
      }
    }
  }

  @override
  $AppealOutcome deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = $AppealOutcomeBuilder();
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

class AppealOutcomeStatusEnum extends EnumClass {

  @BuiltValueEnumConst(wireName: r'pending_quorum')
  static const AppealOutcomeStatusEnum pendingQuorum = _$appealOutcomeStatusEnum_pendingQuorum;
  @BuiltValueEnumConst(wireName: r'no_consensus')
  static const AppealOutcomeStatusEnum noConsensus = _$appealOutcomeStatusEnum_noConsensus;
  @BuiltValueEnumConst(wireName: r'pending_adjudication')
  static const AppealOutcomeStatusEnum pendingAdjudication = _$appealOutcomeStatusEnum_pendingAdjudication;
  @BuiltValueEnumConst(wireName: r'adjudication_disagreement')
  static const AppealOutcomeStatusEnum adjudicationDisagreement = _$appealOutcomeStatusEnum_adjudicationDisagreement;
  @BuiltValueEnumConst(wireName: r'resolved')
  static const AppealOutcomeStatusEnum resolved = _$appealOutcomeStatusEnum_resolved;

  static Serializer<AppealOutcomeStatusEnum> get serializer => _$appealOutcomeStatusEnumSerializer;

  const AppealOutcomeStatusEnum._(String name): super(name);

  static BuiltSet<AppealOutcomeStatusEnum> get values => _$appealOutcomeStatusEnumValues;
  static AppealOutcomeStatusEnum valueOf(String name) => _$appealOutcomeStatusEnumValueOf(name);
}

class AppealOutcomeReviewerPanelDecisionEnum extends EnumClass {

  @BuiltValueEnumConst(wireName: r'overturn')
  static const AppealOutcomeReviewerPanelDecisionEnum overturn = _$appealOutcomeReviewerPanelDecisionEnum_overturn;
  @BuiltValueEnumConst(wireName: r'uphold')
  static const AppealOutcomeReviewerPanelDecisionEnum uphold = _$appealOutcomeReviewerPanelDecisionEnum_uphold;

  static Serializer<AppealOutcomeReviewerPanelDecisionEnum> get serializer => _$appealOutcomeReviewerPanelDecisionEnumSerializer;

  const AppealOutcomeReviewerPanelDecisionEnum._(String name): super(name);

  static BuiltSet<AppealOutcomeReviewerPanelDecisionEnum> get values => _$appealOutcomeReviewerPanelDecisionEnumValues;
  static AppealOutcomeReviewerPanelDecisionEnum valueOf(String name) => _$appealOutcomeReviewerPanelDecisionEnumValueOf(name);
}

class AppealOutcomeFinalDecisionEnum extends EnumClass {

  @BuiltValueEnumConst(wireName: r'overturn')
  static const AppealOutcomeFinalDecisionEnum overturn = _$appealOutcomeFinalDecisionEnum_overturn;
  @BuiltValueEnumConst(wireName: r'uphold')
  static const AppealOutcomeFinalDecisionEnum uphold = _$appealOutcomeFinalDecisionEnum_uphold;

  static Serializer<AppealOutcomeFinalDecisionEnum> get serializer => _$appealOutcomeFinalDecisionEnumSerializer;

  const AppealOutcomeFinalDecisionEnum._(String name): super(name);

  static BuiltSet<AppealOutcomeFinalDecisionEnum> get values => _$appealOutcomeFinalDecisionEnumValues;
  static AppealOutcomeFinalDecisionEnum valueOf(String name) => _$appealOutcomeFinalDecisionEnumValueOf(name);
}

class AppealOutcomeRequiredAdjudicatorsEnum extends EnumClass {

  @BuiltValueEnumConst(wireNumber: 1)
  static const AppealOutcomeRequiredAdjudicatorsEnum number1 = _$appealOutcomeRequiredAdjudicatorsEnum_number1;
  @BuiltValueEnumConst(wireNumber: 2)
  static const AppealOutcomeRequiredAdjudicatorsEnum number2 = _$appealOutcomeRequiredAdjudicatorsEnum_number2;

  static Serializer<AppealOutcomeRequiredAdjudicatorsEnum> get serializer => _$appealOutcomeRequiredAdjudicatorsEnumSerializer;

  const AppealOutcomeRequiredAdjudicatorsEnum._(String name): super(name);

  static BuiltSet<AppealOutcomeRequiredAdjudicatorsEnum> get values => _$appealOutcomeRequiredAdjudicatorsEnumValues;
  static AppealOutcomeRequiredAdjudicatorsEnum valueOf(String name) => _$appealOutcomeRequiredAdjudicatorsEnumValueOf(name);
}
