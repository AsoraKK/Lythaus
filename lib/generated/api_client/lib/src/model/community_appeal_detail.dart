//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:built_collection/built_collection.dart';
import 'package:lythaus_api_client/src/model/community_own_ballot.dart';
import 'package:lythaus_api_client/src/model/community_appeal_outcome.dart';
import 'package:lythaus_api_client/src/model/community_appeal_evidence.dart';
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'community_appeal_detail.g.dart';

/// CommunityAppealDetail
///
/// Properties:
/// * [appealId]
/// * [policyVersion]
/// * [rulesVersion]
/// * [state]
/// * [reviewClass]
/// * [opensAt]
/// * [closesAt]
/// * [extensions]
/// * [question]
/// * [ownBallot]
/// * [outcome]
/// * [evidence]
@BuiltValue()
abstract class CommunityAppealDetail implements Built<CommunityAppealDetail, CommunityAppealDetailBuilder> {
  @BuiltValueField(wireName: r'appealId')
  String get appealId;

  @BuiltValueField(wireName: r'policyVersion')
  CommunityAppealDetailPolicyVersionEnum get policyVersion;
  // enum policyVersionEnum {  lythaus-monthly-rewards-2026-10-v1,  };

  @BuiltValueField(wireName: r'rulesVersion')
  String get rulesVersion;

  @BuiltValueField(wireName: r'state')
  CommunityAppealDetailStateEnum get state;
  // enum stateEnum {  submitted,  triaged,  open,  closing,  extended,  resolved_allow,  resolved_retain,  unresolved,  restricted_review,  withdrawn,  };

  @BuiltValueField(wireName: r'reviewClass')
  CommunityAppealDetailReviewClassEnum get reviewClass;
  // enum reviewClassEnum {  untriaged,  standard,  restricted,  };

  @BuiltValueField(wireName: r'opensAt')
  DateTime? get opensAt;

  @BuiltValueField(wireName: r'closesAt')
  DateTime? get closesAt;

  @BuiltValueField(wireName: r'extensions')
  int get extensions;

  @BuiltValueField(wireName: r'question')
  CommunityAppealDetailQuestionEnum get question;
  // enum questionEnum {  Was the challenged rule correctly applied to this content version?,  };

  @BuiltValueField(wireName: r'ownBallot')
  CommunityOwnBallot? get ownBallot;

  @BuiltValueField(wireName: r'outcome')
  CommunityAppealOutcome? get outcome;

  @BuiltValueField(wireName: r'evidence')
  CommunityAppealEvidence? get evidence;

  CommunityAppealDetail._();

  factory CommunityAppealDetail([void updates(CommunityAppealDetailBuilder b)]) = _$CommunityAppealDetail;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(CommunityAppealDetailBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<CommunityAppealDetail> get serializer => _$CommunityAppealDetailSerializer();
}

class _$CommunityAppealDetailSerializer implements PrimitiveSerializer<CommunityAppealDetail> {
  @override
  final Iterable<Type> types = const [CommunityAppealDetail, _$CommunityAppealDetail];

  @override
  final String wireName = r'CommunityAppealDetail';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    CommunityAppealDetail object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    yield r'appealId';
    yield serializers.serialize(
      object.appealId,
      specifiedType: const FullType(String),
    );
    yield r'policyVersion';
    yield serializers.serialize(
      object.policyVersion,
      specifiedType: const FullType(CommunityAppealDetailPolicyVersionEnum),
    );
    yield r'rulesVersion';
    yield serializers.serialize(
      object.rulesVersion,
      specifiedType: const FullType(String),
    );
    yield r'state';
    yield serializers.serialize(
      object.state,
      specifiedType: const FullType(CommunityAppealDetailStateEnum),
    );
    yield r'reviewClass';
    yield serializers.serialize(
      object.reviewClass,
      specifiedType: const FullType(CommunityAppealDetailReviewClassEnum),
    );
    yield r'opensAt';
    yield object.opensAt == null ? null : serializers.serialize(
      object.opensAt,
      specifiedType: const FullType.nullable(DateTime),
    );
    yield r'closesAt';
    yield object.closesAt == null ? null : serializers.serialize(
      object.closesAt,
      specifiedType: const FullType.nullable(DateTime),
    );
    yield r'extensions';
    yield serializers.serialize(
      object.extensions,
      specifiedType: const FullType(int),
    );
    yield r'question';
    yield serializers.serialize(
      object.question,
      specifiedType: const FullType(CommunityAppealDetailQuestionEnum),
    );
    yield r'ownBallot';
    yield object.ownBallot == null ? null : serializers.serialize(
      object.ownBallot,
      specifiedType: const FullType.nullable(CommunityOwnBallot),
    );
    yield r'outcome';
    yield object.outcome == null ? null : serializers.serialize(
      object.outcome,
      specifiedType: const FullType.nullable(CommunityAppealOutcome),
    );
    yield r'evidence';
    yield object.evidence == null ? null : serializers.serialize(
      object.evidence,
      specifiedType: const FullType.nullable(CommunityAppealEvidence),
    );
  }

  @override
  Object serialize(
    Serializers serializers,
    CommunityAppealDetail object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required CommunityAppealDetailBuilder result,
    required List<Object?> unhandled,
  }) {
    for (var i = 0; i < serializedList.length; i += 2) {
      final key = serializedList[i] as String;
      final value = serializedList[i + 1];
      switch (key) {
        case r'appealId':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.appealId = valueDes;
          break;
        case r'policyVersion':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(CommunityAppealDetailPolicyVersionEnum),
          ) as CommunityAppealDetailPolicyVersionEnum;
          result.policyVersion = valueDes;
          break;
        case r'rulesVersion':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.rulesVersion = valueDes;
          break;
        case r'state':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(CommunityAppealDetailStateEnum),
          ) as CommunityAppealDetailStateEnum;
          result.state = valueDes;
          break;
        case r'reviewClass':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(CommunityAppealDetailReviewClassEnum),
          ) as CommunityAppealDetailReviewClassEnum;
          result.reviewClass = valueDes;
          break;
        case r'opensAt':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType.nullable(DateTime),
          ) as DateTime?;
          if (valueDes == null) continue;
          result.opensAt = valueDes;
          break;
        case r'closesAt':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType.nullable(DateTime),
          ) as DateTime?;
          if (valueDes == null) continue;
          result.closesAt = valueDes;
          break;
        case r'extensions':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(int),
          ) as int;
          result.extensions = valueDes;
          break;
        case r'question':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(CommunityAppealDetailQuestionEnum),
          ) as CommunityAppealDetailQuestionEnum;
          result.question = valueDes;
          break;
        case r'ownBallot':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType.nullable(CommunityOwnBallot),
          ) as CommunityOwnBallot?;
          if (valueDes == null) continue;
          result.ownBallot.replace(valueDes);
          break;
        case r'outcome':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType.nullable(CommunityAppealOutcome),
          ) as CommunityAppealOutcome?;
          if (valueDes == null) continue;
          result.outcome.replace(valueDes);
          break;
        case r'evidence':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType.nullable(CommunityAppealEvidence),
          ) as CommunityAppealEvidence?;
          if (valueDes == null) continue;
          result.evidence.replace(valueDes);
          break;
        default:
          unhandled.add(key);
          unhandled.add(value);
          break;
      }
    }
  }

  @override
  CommunityAppealDetail deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = CommunityAppealDetailBuilder();
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

class CommunityAppealDetailPolicyVersionEnum extends EnumClass {

  @BuiltValueEnumConst(wireName: r'lythaus-monthly-rewards-2026-10-v1')
  static const CommunityAppealDetailPolicyVersionEnum lythausMonthlyRewards202610V1 = _$communityAppealDetailPolicyVersionEnum_lythausMonthlyRewards202610V1;

  static Serializer<CommunityAppealDetailPolicyVersionEnum> get serializer => _$communityAppealDetailPolicyVersionEnumSerializer;

  const CommunityAppealDetailPolicyVersionEnum._(String name): super(name);

  static BuiltSet<CommunityAppealDetailPolicyVersionEnum> get values => _$communityAppealDetailPolicyVersionEnumValues;
  static CommunityAppealDetailPolicyVersionEnum valueOf(String name) => _$communityAppealDetailPolicyVersionEnumValueOf(name);
}

class CommunityAppealDetailStateEnum extends EnumClass {

  @BuiltValueEnumConst(wireName: r'submitted')
  static const CommunityAppealDetailStateEnum submitted = _$communityAppealDetailStateEnum_submitted;
  @BuiltValueEnumConst(wireName: r'triaged')
  static const CommunityAppealDetailStateEnum triaged = _$communityAppealDetailStateEnum_triaged;
  @BuiltValueEnumConst(wireName: r'open')
  static const CommunityAppealDetailStateEnum open = _$communityAppealDetailStateEnum_open;
  @BuiltValueEnumConst(wireName: r'closing')
  static const CommunityAppealDetailStateEnum closing = _$communityAppealDetailStateEnum_closing;
  @BuiltValueEnumConst(wireName: r'extended')
  static const CommunityAppealDetailStateEnum extended = _$communityAppealDetailStateEnum_extended;
  @BuiltValueEnumConst(wireName: r'resolved_allow')
  static const CommunityAppealDetailStateEnum resolvedAllow = _$communityAppealDetailStateEnum_resolvedAllow;
  @BuiltValueEnumConst(wireName: r'resolved_retain')
  static const CommunityAppealDetailStateEnum resolvedRetain = _$communityAppealDetailStateEnum_resolvedRetain;
  @BuiltValueEnumConst(wireName: r'unresolved')
  static const CommunityAppealDetailStateEnum unresolved = _$communityAppealDetailStateEnum_unresolved;
  @BuiltValueEnumConst(wireName: r'restricted_review')
  static const CommunityAppealDetailStateEnum restrictedReview = _$communityAppealDetailStateEnum_restrictedReview;
  @BuiltValueEnumConst(wireName: r'withdrawn')
  static const CommunityAppealDetailStateEnum withdrawn = _$communityAppealDetailStateEnum_withdrawn;

  static Serializer<CommunityAppealDetailStateEnum> get serializer => _$communityAppealDetailStateEnumSerializer;

  const CommunityAppealDetailStateEnum._(String name): super(name);

  static BuiltSet<CommunityAppealDetailStateEnum> get values => _$communityAppealDetailStateEnumValues;
  static CommunityAppealDetailStateEnum valueOf(String name) => _$communityAppealDetailStateEnumValueOf(name);
}

class CommunityAppealDetailReviewClassEnum extends EnumClass {

  @BuiltValueEnumConst(wireName: r'untriaged')
  static const CommunityAppealDetailReviewClassEnum untriaged = _$communityAppealDetailReviewClassEnum_untriaged;
  @BuiltValueEnumConst(wireName: r'standard')
  static const CommunityAppealDetailReviewClassEnum standard = _$communityAppealDetailReviewClassEnum_standard;
  @BuiltValueEnumConst(wireName: r'restricted')
  static const CommunityAppealDetailReviewClassEnum restricted = _$communityAppealDetailReviewClassEnum_restricted;

  static Serializer<CommunityAppealDetailReviewClassEnum> get serializer => _$communityAppealDetailReviewClassEnumSerializer;

  const CommunityAppealDetailReviewClassEnum._(String name): super(name);

  static BuiltSet<CommunityAppealDetailReviewClassEnum> get values => _$communityAppealDetailReviewClassEnumValues;
  static CommunityAppealDetailReviewClassEnum valueOf(String name) => _$communityAppealDetailReviewClassEnumValueOf(name);
}

class CommunityAppealDetailQuestionEnum extends EnumClass {

  @BuiltValueEnumConst(wireName: r'Was the challenged rule correctly applied to this content version?')
  static const CommunityAppealDetailQuestionEnum wasTheChallengedRuleCorrectlyAppliedToThisContentVersionQuestionMark = _$communityAppealDetailQuestionEnum_wasTheChallengedRuleCorrectlyAppliedToThisContentVersionQuestionMark;

  static Serializer<CommunityAppealDetailQuestionEnum> get serializer => _$communityAppealDetailQuestionEnumSerializer;

  const CommunityAppealDetailQuestionEnum._(String name): super(name);

  static BuiltSet<CommunityAppealDetailQuestionEnum> get values => _$communityAppealDetailQuestionEnumValues;
  static CommunityAppealDetailQuestionEnum valueOf(String name) => _$communityAppealDetailQuestionEnumValueOf(name);
}
