//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:built_collection/built_collection.dart';
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'pending_appeal_adjudication.g.dart';

/// PendingAppealAdjudication
///
/// Properties:
/// * [appealId]
/// * [caseId]
/// * [riskClass]
/// * [policyVersion]
/// * [createdAt]
/// * [expiresAt]
/// * [reviewerPanelDecision]
/// * [completedReviewers]
/// * [totalWeight]
/// * [winningShare]
/// * [requiredAdjudicators]
/// * [outcomeState]
/// * [completedAdjudicators]
@BuiltValue()
abstract class PendingAppealAdjudication implements Built<PendingAppealAdjudication, PendingAppealAdjudicationBuilder> {
  @BuiltValueField(wireName: r'appeal_id')
  String get appealId;

  @BuiltValueField(wireName: r'case_id')
  String get caseId;

  @BuiltValueField(wireName: r'risk_class')
  PendingAppealAdjudicationRiskClassEnum get riskClass;
  // enum riskClassEnum {  standard,  high,  };

  @BuiltValueField(wireName: r'policy_version')
  String get policyVersion;

  @BuiltValueField(wireName: r'created_at')
  DateTime get createdAt;

  @BuiltValueField(wireName: r'expires_at')
  DateTime get expiresAt;

  @BuiltValueField(wireName: r'reviewer_panel_decision')
  PendingAppealAdjudicationReviewerPanelDecisionEnum? get reviewerPanelDecision;
  // enum reviewerPanelDecisionEnum {  overturn,  uphold,  };

  @BuiltValueField(wireName: r'completed_reviewers')
  int get completedReviewers;

  @BuiltValueField(wireName: r'total_weight')
  int get totalWeight;

  @BuiltValueField(wireName: r'winning_share')
  num get winningShare;

  @BuiltValueField(wireName: r'required_adjudicators')
  PendingAppealAdjudicationRequiredAdjudicatorsEnum get requiredAdjudicators;
  // enum requiredAdjudicatorsEnum {  1,  2,  };

  @BuiltValueField(wireName: r'outcome_state')
  PendingAppealAdjudicationOutcomeStateEnum get outcomeState;
  // enum outcomeStateEnum {  pending_adjudication,  adjudication_disagreement,  };

  @BuiltValueField(wireName: r'completed_adjudicators')
  int get completedAdjudicators;

  PendingAppealAdjudication._();

  factory PendingAppealAdjudication([void updates(PendingAppealAdjudicationBuilder b)]) = _$PendingAppealAdjudication;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(PendingAppealAdjudicationBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<PendingAppealAdjudication> get serializer => _$PendingAppealAdjudicationSerializer();
}

class _$PendingAppealAdjudicationSerializer implements PrimitiveSerializer<PendingAppealAdjudication> {
  @override
  final Iterable<Type> types = const [PendingAppealAdjudication, _$PendingAppealAdjudication];

  @override
  final String wireName = r'PendingAppealAdjudication';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    PendingAppealAdjudication object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    yield r'appeal_id';
    yield serializers.serialize(
      object.appealId,
      specifiedType: const FullType(String),
    );
    yield r'case_id';
    yield serializers.serialize(
      object.caseId,
      specifiedType: const FullType(String),
    );
    yield r'risk_class';
    yield serializers.serialize(
      object.riskClass,
      specifiedType: const FullType(PendingAppealAdjudicationRiskClassEnum),
    );
    yield r'policy_version';
    yield serializers.serialize(
      object.policyVersion,
      specifiedType: const FullType(String),
    );
    yield r'created_at';
    yield serializers.serialize(
      object.createdAt,
      specifiedType: const FullType(DateTime),
    );
    yield r'expires_at';
    yield serializers.serialize(
      object.expiresAt,
      specifiedType: const FullType(DateTime),
    );
    if (object.reviewerPanelDecision != null) {
      yield r'reviewer_panel_decision';
      yield serializers.serialize(
        object.reviewerPanelDecision,
        specifiedType: const FullType.nullable(PendingAppealAdjudicationReviewerPanelDecisionEnum),
      );
    }
    yield r'completed_reviewers';
    yield serializers.serialize(
      object.completedReviewers,
      specifiedType: const FullType(int),
    );
    yield r'total_weight';
    yield serializers.serialize(
      object.totalWeight,
      specifiedType: const FullType(int),
    );
    yield r'winning_share';
    yield serializers.serialize(
      object.winningShare,
      specifiedType: const FullType(num),
    );
    yield r'required_adjudicators';
    yield serializers.serialize(
      object.requiredAdjudicators,
      specifiedType: const FullType(PendingAppealAdjudicationRequiredAdjudicatorsEnum),
    );
    yield r'outcome_state';
    yield serializers.serialize(
      object.outcomeState,
      specifiedType: const FullType(PendingAppealAdjudicationOutcomeStateEnum),
    );
    yield r'completed_adjudicators';
    yield serializers.serialize(
      object.completedAdjudicators,
      specifiedType: const FullType(int),
    );
  }

  @override
  Object serialize(
    Serializers serializers,
    PendingAppealAdjudication object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required PendingAppealAdjudicationBuilder result,
    required List<Object?> unhandled,
  }) {
    for (var i = 0; i < serializedList.length; i += 2) {
      final key = serializedList[i] as String;
      final value = serializedList[i + 1];
      switch (key) {
        case r'appeal_id':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.appealId = valueDes;
          break;
        case r'case_id':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.caseId = valueDes;
          break;
        case r'risk_class':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(PendingAppealAdjudicationRiskClassEnum),
          ) as PendingAppealAdjudicationRiskClassEnum;
          result.riskClass = valueDes;
          break;
        case r'policy_version':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.policyVersion = valueDes;
          break;
        case r'created_at':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(DateTime),
          ) as DateTime;
          result.createdAt = valueDes;
          break;
        case r'expires_at':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(DateTime),
          ) as DateTime;
          result.expiresAt = valueDes;
          break;
        case r'reviewer_panel_decision':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType.nullable(PendingAppealAdjudicationReviewerPanelDecisionEnum),
          ) as PendingAppealAdjudicationReviewerPanelDecisionEnum?;
          if (valueDes == null) continue;
          result.reviewerPanelDecision = valueDes;
          break;
        case r'completed_reviewers':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(int),
          ) as int;
          result.completedReviewers = valueDes;
          break;
        case r'total_weight':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(int),
          ) as int;
          result.totalWeight = valueDes;
          break;
        case r'winning_share':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(num),
          ) as num;
          result.winningShare = valueDes;
          break;
        case r'required_adjudicators':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(PendingAppealAdjudicationRequiredAdjudicatorsEnum),
          ) as PendingAppealAdjudicationRequiredAdjudicatorsEnum;
          result.requiredAdjudicators = valueDes;
          break;
        case r'outcome_state':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(PendingAppealAdjudicationOutcomeStateEnum),
          ) as PendingAppealAdjudicationOutcomeStateEnum;
          result.outcomeState = valueDes;
          break;
        case r'completed_adjudicators':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(int),
          ) as int;
          result.completedAdjudicators = valueDes;
          break;
        default:
          unhandled.add(key);
          unhandled.add(value);
          break;
      }
    }
  }

  @override
  PendingAppealAdjudication deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = PendingAppealAdjudicationBuilder();
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

class PendingAppealAdjudicationRiskClassEnum extends EnumClass {

  @BuiltValueEnumConst(wireName: r'standard')
  static const PendingAppealAdjudicationRiskClassEnum standard = _$pendingAppealAdjudicationRiskClassEnum_standard;
  @BuiltValueEnumConst(wireName: r'high')
  static const PendingAppealAdjudicationRiskClassEnum high = _$pendingAppealAdjudicationRiskClassEnum_high;

  static Serializer<PendingAppealAdjudicationRiskClassEnum> get serializer => _$pendingAppealAdjudicationRiskClassEnumSerializer;

  const PendingAppealAdjudicationRiskClassEnum._(String name): super(name);

  static BuiltSet<PendingAppealAdjudicationRiskClassEnum> get values => _$pendingAppealAdjudicationRiskClassEnumValues;
  static PendingAppealAdjudicationRiskClassEnum valueOf(String name) => _$pendingAppealAdjudicationRiskClassEnumValueOf(name);
}

class PendingAppealAdjudicationReviewerPanelDecisionEnum extends EnumClass {

  @BuiltValueEnumConst(wireName: r'overturn')
  static const PendingAppealAdjudicationReviewerPanelDecisionEnum overturn = _$pendingAppealAdjudicationReviewerPanelDecisionEnum_overturn;
  @BuiltValueEnumConst(wireName: r'uphold')
  static const PendingAppealAdjudicationReviewerPanelDecisionEnum uphold = _$pendingAppealAdjudicationReviewerPanelDecisionEnum_uphold;

  static Serializer<PendingAppealAdjudicationReviewerPanelDecisionEnum> get serializer => _$pendingAppealAdjudicationReviewerPanelDecisionEnumSerializer;

  const PendingAppealAdjudicationReviewerPanelDecisionEnum._(String name): super(name);

  static BuiltSet<PendingAppealAdjudicationReviewerPanelDecisionEnum> get values => _$pendingAppealAdjudicationReviewerPanelDecisionEnumValues;
  static PendingAppealAdjudicationReviewerPanelDecisionEnum valueOf(String name) => _$pendingAppealAdjudicationReviewerPanelDecisionEnumValueOf(name);
}

class PendingAppealAdjudicationRequiredAdjudicatorsEnum extends EnumClass {

  @BuiltValueEnumConst(wireNumber: 1)
  static const PendingAppealAdjudicationRequiredAdjudicatorsEnum number1 = _$pendingAppealAdjudicationRequiredAdjudicatorsEnum_number1;
  @BuiltValueEnumConst(wireNumber: 2)
  static const PendingAppealAdjudicationRequiredAdjudicatorsEnum number2 = _$pendingAppealAdjudicationRequiredAdjudicatorsEnum_number2;

  static Serializer<PendingAppealAdjudicationRequiredAdjudicatorsEnum> get serializer => _$pendingAppealAdjudicationRequiredAdjudicatorsEnumSerializer;

  const PendingAppealAdjudicationRequiredAdjudicatorsEnum._(String name): super(name);

  static BuiltSet<PendingAppealAdjudicationRequiredAdjudicatorsEnum> get values => _$pendingAppealAdjudicationRequiredAdjudicatorsEnumValues;
  static PendingAppealAdjudicationRequiredAdjudicatorsEnum valueOf(String name) => _$pendingAppealAdjudicationRequiredAdjudicatorsEnumValueOf(name);
}

class PendingAppealAdjudicationOutcomeStateEnum extends EnumClass {

  @BuiltValueEnumConst(wireName: r'pending_adjudication')
  static const PendingAppealAdjudicationOutcomeStateEnum pendingAdjudication = _$pendingAppealAdjudicationOutcomeStateEnum_pendingAdjudication;
  @BuiltValueEnumConst(wireName: r'adjudication_disagreement')
  static const PendingAppealAdjudicationOutcomeStateEnum adjudicationDisagreement = _$pendingAppealAdjudicationOutcomeStateEnum_adjudicationDisagreement;

  static Serializer<PendingAppealAdjudicationOutcomeStateEnum> get serializer => _$pendingAppealAdjudicationOutcomeStateEnumSerializer;

  const PendingAppealAdjudicationOutcomeStateEnum._(String name): super(name);

  static BuiltSet<PendingAppealAdjudicationOutcomeStateEnum> get values => _$pendingAppealAdjudicationOutcomeStateEnumValues;
  static PendingAppealAdjudicationOutcomeStateEnum valueOf(String name) => _$pendingAppealAdjudicationOutcomeStateEnumValueOf(name);
}
