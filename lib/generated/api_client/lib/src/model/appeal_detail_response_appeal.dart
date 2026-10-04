//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:lythaus_api_client/src/model/community_appeal_detail.dart';
import 'package:built_collection/built_collection.dart';
import 'package:lythaus_api_client/src/model/community_own_ballot.dart';
import 'package:lythaus_api_client/src/model/appeal_detail.dart';
import 'package:lythaus_api_client/src/model/community_appeal_outcome.dart';
import 'package:lythaus_api_client/src/model/community_appeal_evidence.dart';
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';
import 'package:one_of/one_of.dart';

part 'appeal_detail_response_appeal.g.dart';

/// AppealDetailResponseAppeal
///
/// Properties:
/// * [id]
/// * [caseId]
/// * [state]
/// * [riskClass]
/// * [policyVersion]
/// * [createdAt]
/// * [expiresAt]
/// * [resolvedAt]
/// * [reviewerPanelDecision]
/// * [finalDecision]
/// * [completedReviewers]
/// * [outcomeState]
/// * [reviewerAssigned]
/// * [reviewerDecision]
/// * [appealId]
/// * [policyVersion]
/// * [rulesVersion]
/// * [reviewClass]
/// * [opensAt]
/// * [closesAt]
/// * [extensions]
/// * [question]
/// * [ownBallot]
/// * [outcome]
/// * [evidence]
@BuiltValue()
abstract class AppealDetailResponseAppeal implements Built<AppealDetailResponseAppeal, AppealDetailResponseAppealBuilder> {
  /// One Of [AppealDetail], [CommunityAppealDetail]
  OneOf get oneOf;

  AppealDetailResponseAppeal._();

  factory AppealDetailResponseAppeal([void updates(AppealDetailResponseAppealBuilder b)]) = _$AppealDetailResponseAppeal;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(AppealDetailResponseAppealBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<AppealDetailResponseAppeal> get serializer => _$AppealDetailResponseAppealSerializer();
}

class _$AppealDetailResponseAppealSerializer implements PrimitiveSerializer<AppealDetailResponseAppeal> {
  @override
  final Iterable<Type> types = const [AppealDetailResponseAppeal, _$AppealDetailResponseAppeal];

  @override
  final String wireName = r'AppealDetailResponseAppeal';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    AppealDetailResponseAppeal object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
  }

  @override
  Object serialize(
    Serializers serializers,
    AppealDetailResponseAppeal object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final oneOf = object.oneOf;
    return serializers.serialize(oneOf.value, specifiedType: FullType(oneOf.valueType))!;
  }

  @override
  AppealDetailResponseAppeal deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = AppealDetailResponseAppealBuilder();
    Object? oneOfDataSrc;
    final targetType = const FullType(OneOf, [FullType(AppealDetail), FullType(CommunityAppealDetail), ]);
    oneOfDataSrc = serialized;
    result.oneOf = serializers.deserialize(oneOfDataSrc, specifiedType: targetType) as OneOf;
    return result.build();
  }
}

class AppealDetailResponseAppealStateEnum extends EnumClass {

  @BuiltValueEnumConst(wireName: r'submitted')
  static const AppealDetailResponseAppealStateEnum submitted = _$appealDetailResponseAppealStateEnum_submitted;
  @BuiltValueEnumConst(wireName: r'triaged')
  static const AppealDetailResponseAppealStateEnum triaged = _$appealDetailResponseAppealStateEnum_triaged;
  @BuiltValueEnumConst(wireName: r'open')
  static const AppealDetailResponseAppealStateEnum open = _$appealDetailResponseAppealStateEnum_open;
  @BuiltValueEnumConst(wireName: r'closing')
  static const AppealDetailResponseAppealStateEnum closing = _$appealDetailResponseAppealStateEnum_closing;
  @BuiltValueEnumConst(wireName: r'extended')
  static const AppealDetailResponseAppealStateEnum extended = _$appealDetailResponseAppealStateEnum_extended;
  @BuiltValueEnumConst(wireName: r'resolved_allow')
  static const AppealDetailResponseAppealStateEnum resolvedAllow = _$appealDetailResponseAppealStateEnum_resolvedAllow;
  @BuiltValueEnumConst(wireName: r'resolved_retain')
  static const AppealDetailResponseAppealStateEnum resolvedRetain = _$appealDetailResponseAppealStateEnum_resolvedRetain;
  @BuiltValueEnumConst(wireName: r'unresolved')
  static const AppealDetailResponseAppealStateEnum unresolved = _$appealDetailResponseAppealStateEnum_unresolved;
  @BuiltValueEnumConst(wireName: r'restricted_review')
  static const AppealDetailResponseAppealStateEnum restrictedReview = _$appealDetailResponseAppealStateEnum_restrictedReview;
  @BuiltValueEnumConst(wireName: r'withdrawn')
  static const AppealDetailResponseAppealStateEnum withdrawn = _$appealDetailResponseAppealStateEnum_withdrawn;

  static Serializer<AppealDetailResponseAppealStateEnum> get serializer => _$appealDetailResponseAppealStateEnumSerializer;

  const AppealDetailResponseAppealStateEnum._(String name): super(name);

  static BuiltSet<AppealDetailResponseAppealStateEnum> get values => _$appealDetailResponseAppealStateEnumValues;
  static AppealDetailResponseAppealStateEnum valueOf(String name) => _$appealDetailResponseAppealStateEnumValueOf(name);
}

class AppealDetailResponseAppealRiskClassEnum extends EnumClass {

  @BuiltValueEnumConst(wireName: r'standard')
  static const AppealDetailResponseAppealRiskClassEnum standard = _$appealDetailResponseAppealRiskClassEnum_standard;
  @BuiltValueEnumConst(wireName: r'high')
  static const AppealDetailResponseAppealRiskClassEnum high = _$appealDetailResponseAppealRiskClassEnum_high;

  static Serializer<AppealDetailResponseAppealRiskClassEnum> get serializer => _$appealDetailResponseAppealRiskClassEnumSerializer;

  const AppealDetailResponseAppealRiskClassEnum._(String name): super(name);

  static BuiltSet<AppealDetailResponseAppealRiskClassEnum> get values => _$appealDetailResponseAppealRiskClassEnumValues;
  static AppealDetailResponseAppealRiskClassEnum valueOf(String name) => _$appealDetailResponseAppealRiskClassEnumValueOf(name);
}

class AppealDetailResponseAppealReviewerPanelDecisionEnum extends EnumClass {

  @BuiltValueEnumConst(wireName: r'overturn')
  static const AppealDetailResponseAppealReviewerPanelDecisionEnum overturn = _$appealDetailResponseAppealReviewerPanelDecisionEnum_overturn;
  @BuiltValueEnumConst(wireName: r'uphold')
  static const AppealDetailResponseAppealReviewerPanelDecisionEnum uphold = _$appealDetailResponseAppealReviewerPanelDecisionEnum_uphold;

  static Serializer<AppealDetailResponseAppealReviewerPanelDecisionEnum> get serializer => _$appealDetailResponseAppealReviewerPanelDecisionEnumSerializer;

  const AppealDetailResponseAppealReviewerPanelDecisionEnum._(String name): super(name);

  static BuiltSet<AppealDetailResponseAppealReviewerPanelDecisionEnum> get values => _$appealDetailResponseAppealReviewerPanelDecisionEnumValues;
  static AppealDetailResponseAppealReviewerPanelDecisionEnum valueOf(String name) => _$appealDetailResponseAppealReviewerPanelDecisionEnumValueOf(name);
}

class AppealDetailResponseAppealFinalDecisionEnum extends EnumClass {

  @BuiltValueEnumConst(wireName: r'overturn')
  static const AppealDetailResponseAppealFinalDecisionEnum overturn = _$appealDetailResponseAppealFinalDecisionEnum_overturn;
  @BuiltValueEnumConst(wireName: r'uphold')
  static const AppealDetailResponseAppealFinalDecisionEnum uphold = _$appealDetailResponseAppealFinalDecisionEnum_uphold;

  static Serializer<AppealDetailResponseAppealFinalDecisionEnum> get serializer => _$appealDetailResponseAppealFinalDecisionEnumSerializer;

  const AppealDetailResponseAppealFinalDecisionEnum._(String name): super(name);

  static BuiltSet<AppealDetailResponseAppealFinalDecisionEnum> get values => _$appealDetailResponseAppealFinalDecisionEnumValues;
  static AppealDetailResponseAppealFinalDecisionEnum valueOf(String name) => _$appealDetailResponseAppealFinalDecisionEnumValueOf(name);
}

class AppealDetailResponseAppealReviewerDecisionEnum extends EnumClass {

  @BuiltValueEnumConst(wireName: r'overturn')
  static const AppealDetailResponseAppealReviewerDecisionEnum overturn = _$appealDetailResponseAppealReviewerDecisionEnum_overturn;
  @BuiltValueEnumConst(wireName: r'uphold')
  static const AppealDetailResponseAppealReviewerDecisionEnum uphold = _$appealDetailResponseAppealReviewerDecisionEnum_uphold;

  static Serializer<AppealDetailResponseAppealReviewerDecisionEnum> get serializer => _$appealDetailResponseAppealReviewerDecisionEnumSerializer;

  const AppealDetailResponseAppealReviewerDecisionEnum._(String name): super(name);

  static BuiltSet<AppealDetailResponseAppealReviewerDecisionEnum> get values => _$appealDetailResponseAppealReviewerDecisionEnumValues;
  static AppealDetailResponseAppealReviewerDecisionEnum valueOf(String name) => _$appealDetailResponseAppealReviewerDecisionEnumValueOf(name);
}

class AppealDetailResponseAppealPolicyVersionEnum extends EnumClass {

  @BuiltValueEnumConst(wireName: r'lythaus-monthly-rewards-2026-10-v1')
  static const AppealDetailResponseAppealPolicyVersionEnum lythausMonthlyRewards202610V1 = _$appealDetailResponseAppealPolicyVersionEnum_lythausMonthlyRewards202610V1;

  static Serializer<AppealDetailResponseAppealPolicyVersionEnum> get serializer => _$appealDetailResponseAppealPolicyVersionEnumSerializer;

  const AppealDetailResponseAppealPolicyVersionEnum._(String name): super(name);

  static BuiltSet<AppealDetailResponseAppealPolicyVersionEnum> get values => _$appealDetailResponseAppealPolicyVersionEnumValues;
  static AppealDetailResponseAppealPolicyVersionEnum valueOf(String name) => _$appealDetailResponseAppealPolicyVersionEnumValueOf(name);
}

class AppealDetailResponseAppealReviewClassEnum extends EnumClass {

  @BuiltValueEnumConst(wireName: r'untriaged')
  static const AppealDetailResponseAppealReviewClassEnum untriaged = _$appealDetailResponseAppealReviewClassEnum_untriaged;
  @BuiltValueEnumConst(wireName: r'standard')
  static const AppealDetailResponseAppealReviewClassEnum standard = _$appealDetailResponseAppealReviewClassEnum_standard;
  @BuiltValueEnumConst(wireName: r'restricted')
  static const AppealDetailResponseAppealReviewClassEnum restricted = _$appealDetailResponseAppealReviewClassEnum_restricted;

  static Serializer<AppealDetailResponseAppealReviewClassEnum> get serializer => _$appealDetailResponseAppealReviewClassEnumSerializer;

  const AppealDetailResponseAppealReviewClassEnum._(String name): super(name);

  static BuiltSet<AppealDetailResponseAppealReviewClassEnum> get values => _$appealDetailResponseAppealReviewClassEnumValues;
  static AppealDetailResponseAppealReviewClassEnum valueOf(String name) => _$appealDetailResponseAppealReviewClassEnumValueOf(name);
}

class AppealDetailResponseAppealQuestionEnum extends EnumClass {

  @BuiltValueEnumConst(wireName: r'Was the challenged rule correctly applied to this content version?')
  static const AppealDetailResponseAppealQuestionEnum wasTheChallengedRuleCorrectlyAppliedToThisContentVersionQuestionMark = _$appealDetailResponseAppealQuestionEnum_wasTheChallengedRuleCorrectlyAppliedToThisContentVersionQuestionMark;

  static Serializer<AppealDetailResponseAppealQuestionEnum> get serializer => _$appealDetailResponseAppealQuestionEnumSerializer;

  const AppealDetailResponseAppealQuestionEnum._(String name): super(name);

  static BuiltSet<AppealDetailResponseAppealQuestionEnum> get values => _$appealDetailResponseAppealQuestionEnumValues;
  static AppealDetailResponseAppealQuestionEnum valueOf(String name) => _$appealDetailResponseAppealQuestionEnumValueOf(name);
}
