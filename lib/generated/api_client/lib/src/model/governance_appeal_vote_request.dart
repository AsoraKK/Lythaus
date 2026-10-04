//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:built_collection/built_collection.dart';
import 'package:lythaus_api_client/src/model/community_ballot_request.dart';
import 'package:lythaus_api_client/src/model/legacy_appeal_vote_request.dart';
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';
import 'package:one_of/one_of.dart';

part 'governance_appeal_vote_request.g.dart';

/// GovernanceAppealVoteRequest
///
/// Properties:
/// * [decision]
/// * [choice]
/// * [reasonCode]
/// * [expectedRevision]
/// * [contextAcknowledged]
@BuiltValue()
abstract class GovernanceAppealVoteRequest implements Built<GovernanceAppealVoteRequest, GovernanceAppealVoteRequestBuilder> {
  /// One Of [CommunityBallotRequest], [LegacyAppealVoteRequest]
  OneOf get oneOf;

  GovernanceAppealVoteRequest._();

  factory GovernanceAppealVoteRequest([void updates(GovernanceAppealVoteRequestBuilder b)]) = _$GovernanceAppealVoteRequest;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(GovernanceAppealVoteRequestBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<GovernanceAppealVoteRequest> get serializer => _$GovernanceAppealVoteRequestSerializer();
}

class _$GovernanceAppealVoteRequestSerializer implements PrimitiveSerializer<GovernanceAppealVoteRequest> {
  @override
  final Iterable<Type> types = const [GovernanceAppealVoteRequest, _$GovernanceAppealVoteRequest];

  @override
  final String wireName = r'GovernanceAppealVoteRequest';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    GovernanceAppealVoteRequest object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
  }

  @override
  Object serialize(
    Serializers serializers,
    GovernanceAppealVoteRequest object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final oneOf = object.oneOf;
    return serializers.serialize(oneOf.value, specifiedType: FullType(oneOf.valueType))!;
  }

  @override
  GovernanceAppealVoteRequest deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = GovernanceAppealVoteRequestBuilder();
    Object? oneOfDataSrc;
    final targetType = const FullType(OneOf, [FullType(LegacyAppealVoteRequest), FullType(CommunityBallotRequest), ]);
    oneOfDataSrc = serialized;
    result.oneOf = serializers.deserialize(oneOfDataSrc, specifiedType: targetType) as OneOf;
    return result.build();
  }
}

class GovernanceAppealVoteRequestDecisionEnum extends EnumClass {

  @BuiltValueEnumConst(wireName: r'overturn')
  static const GovernanceAppealVoteRequestDecisionEnum overturn = _$governanceAppealVoteRequestDecisionEnum_overturn;
  @BuiltValueEnumConst(wireName: r'uphold')
  static const GovernanceAppealVoteRequestDecisionEnum uphold = _$governanceAppealVoteRequestDecisionEnum_uphold;

  static Serializer<GovernanceAppealVoteRequestDecisionEnum> get serializer => _$governanceAppealVoteRequestDecisionEnumSerializer;

  const GovernanceAppealVoteRequestDecisionEnum._(String name): super(name);

  static BuiltSet<GovernanceAppealVoteRequestDecisionEnum> get values => _$governanceAppealVoteRequestDecisionEnumValues;
  static GovernanceAppealVoteRequestDecisionEnum valueOf(String name) => _$governanceAppealVoteRequestDecisionEnumValueOf(name);
}

class GovernanceAppealVoteRequestChoiceEnum extends EnumClass {

  @BuiltValueEnumConst(wireName: r'allow')
  static const GovernanceAppealVoteRequestChoiceEnum allow = _$governanceAppealVoteRequestChoiceEnum_allow;
  @BuiltValueEnumConst(wireName: r'retain')
  static const GovernanceAppealVoteRequestChoiceEnum retain = _$governanceAppealVoteRequestChoiceEnum_retain;
  @BuiltValueEnumConst(wireName: r'recuse')
  static const GovernanceAppealVoteRequestChoiceEnum recuse = _$governanceAppealVoteRequestChoiceEnum_recuse;
  @BuiltValueEnumConst(wireName: r'cannot_assess')
  static const GovernanceAppealVoteRequestChoiceEnum cannotAssess = _$governanceAppealVoteRequestChoiceEnum_cannotAssess;

  static Serializer<GovernanceAppealVoteRequestChoiceEnum> get serializer => _$governanceAppealVoteRequestChoiceEnumSerializer;

  const GovernanceAppealVoteRequestChoiceEnum._(String name): super(name);

  static BuiltSet<GovernanceAppealVoteRequestChoiceEnum> get values => _$governanceAppealVoteRequestChoiceEnumValues;
  static GovernanceAppealVoteRequestChoiceEnum valueOf(String name) => _$governanceAppealVoteRequestChoiceEnumValueOf(name);
}

class GovernanceAppealVoteRequestReasonCodeEnum extends EnumClass {

  @BuiltValueEnumConst(wireName: r'rule_misapplied')
  static const GovernanceAppealVoteRequestReasonCodeEnum ruleMisapplied = _$governanceAppealVoteRequestReasonCodeEnum_ruleMisapplied;
  @BuiltValueEnumConst(wireName: r'rule_applies')
  static const GovernanceAppealVoteRequestReasonCodeEnum ruleApplies = _$governanceAppealVoteRequestReasonCodeEnum_ruleApplies;
  @BuiltValueEnumConst(wireName: r'conflict')
  static const GovernanceAppealVoteRequestReasonCodeEnum conflict = _$governanceAppealVoteRequestReasonCodeEnum_conflict;
  @BuiltValueEnumConst(wireName: r'insufficient_context')
  static const GovernanceAppealVoteRequestReasonCodeEnum insufficientContext = _$governanceAppealVoteRequestReasonCodeEnum_insufficientContext;

  static Serializer<GovernanceAppealVoteRequestReasonCodeEnum> get serializer => _$governanceAppealVoteRequestReasonCodeEnumSerializer;

  const GovernanceAppealVoteRequestReasonCodeEnum._(String name): super(name);

  static BuiltSet<GovernanceAppealVoteRequestReasonCodeEnum> get values => _$governanceAppealVoteRequestReasonCodeEnumValues;
  static GovernanceAppealVoteRequestReasonCodeEnum valueOf(String name) => _$governanceAppealVoteRequestReasonCodeEnumValueOf(name);
}
