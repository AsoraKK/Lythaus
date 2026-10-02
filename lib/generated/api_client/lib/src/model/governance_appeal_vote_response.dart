//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:built_collection/built_collection.dart';
import 'package:lythaus_api_client/src/model/legacy_appeal_vote_response.dart';
import 'package:lythaus_api_client/src/model/community_ballot_response.dart';
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';
import 'package:one_of/one_of.dart';

part 'governance_appeal_vote_response.g.dart';

/// GovernanceAppealVoteResponse
///
/// Properties:
/// * [voteId]
/// * [appealId]
/// * [decision]
/// * [locked]
/// * [ballotId]
/// * [revision]
/// * [choice]
/// * [castAt]
/// * [created]
@BuiltValue()
abstract class GovernanceAppealVoteResponse implements Built<GovernanceAppealVoteResponse, GovernanceAppealVoteResponseBuilder> {
  /// One Of [CommunityBallotResponse], [LegacyAppealVoteResponse]
  OneOf get oneOf;

  GovernanceAppealVoteResponse._();

  factory GovernanceAppealVoteResponse([void updates(GovernanceAppealVoteResponseBuilder b)]) = _$GovernanceAppealVoteResponse;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(GovernanceAppealVoteResponseBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<GovernanceAppealVoteResponse> get serializer => _$GovernanceAppealVoteResponseSerializer();
}

class _$GovernanceAppealVoteResponseSerializer implements PrimitiveSerializer<GovernanceAppealVoteResponse> {
  @override
  final Iterable<Type> types = const [GovernanceAppealVoteResponse, _$GovernanceAppealVoteResponse];

  @override
  final String wireName = r'GovernanceAppealVoteResponse';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    GovernanceAppealVoteResponse object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
  }

  @override
  Object serialize(
    Serializers serializers,
    GovernanceAppealVoteResponse object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final oneOf = object.oneOf;
    return serializers.serialize(oneOf.value, specifiedType: FullType(oneOf.valueType))!;
  }

  @override
  GovernanceAppealVoteResponse deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = GovernanceAppealVoteResponseBuilder();
    Object? oneOfDataSrc;
    final targetType = const FullType(OneOf, [FullType(LegacyAppealVoteResponse), FullType(CommunityBallotResponse), ]);
    oneOfDataSrc = serialized;
    result.oneOf = serializers.deserialize(oneOfDataSrc, specifiedType: targetType) as OneOf;
    return result.build();
  }
}

class GovernanceAppealVoteResponseDecisionEnum extends EnumClass {

  @BuiltValueEnumConst(wireName: r'overturn')
  static const GovernanceAppealVoteResponseDecisionEnum overturn = _$governanceAppealVoteResponseDecisionEnum_overturn;
  @BuiltValueEnumConst(wireName: r'uphold')
  static const GovernanceAppealVoteResponseDecisionEnum uphold = _$governanceAppealVoteResponseDecisionEnum_uphold;

  static Serializer<GovernanceAppealVoteResponseDecisionEnum> get serializer => _$governanceAppealVoteResponseDecisionEnumSerializer;

  const GovernanceAppealVoteResponseDecisionEnum._(String name): super(name);

  static BuiltSet<GovernanceAppealVoteResponseDecisionEnum> get values => _$governanceAppealVoteResponseDecisionEnumValues;
  static GovernanceAppealVoteResponseDecisionEnum valueOf(String name) => _$governanceAppealVoteResponseDecisionEnumValueOf(name);
}

class GovernanceAppealVoteResponseChoiceEnum extends EnumClass {

  @BuiltValueEnumConst(wireName: r'allow')
  static const GovernanceAppealVoteResponseChoiceEnum allow = _$governanceAppealVoteResponseChoiceEnum_allow;
  @BuiltValueEnumConst(wireName: r'retain')
  static const GovernanceAppealVoteResponseChoiceEnum retain = _$governanceAppealVoteResponseChoiceEnum_retain;
  @BuiltValueEnumConst(wireName: r'recuse')
  static const GovernanceAppealVoteResponseChoiceEnum recuse = _$governanceAppealVoteResponseChoiceEnum_recuse;
  @BuiltValueEnumConst(wireName: r'cannot_assess')
  static const GovernanceAppealVoteResponseChoiceEnum cannotAssess = _$governanceAppealVoteResponseChoiceEnum_cannotAssess;

  static Serializer<GovernanceAppealVoteResponseChoiceEnum> get serializer => _$governanceAppealVoteResponseChoiceEnumSerializer;

  const GovernanceAppealVoteResponseChoiceEnum._(String name): super(name);

  static BuiltSet<GovernanceAppealVoteResponseChoiceEnum> get values => _$governanceAppealVoteResponseChoiceEnumValues;
  static GovernanceAppealVoteResponseChoiceEnum valueOf(String name) => _$governanceAppealVoteResponseChoiceEnumValueOf(name);
}
