//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:built_collection/built_collection.dart';
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'community_appeal_outcome_result.g.dart';

/// CommunityAppealOutcomeResult
///
/// Properties:
/// * [policyVersion]
/// * [rulesVersion]
/// * [status]
/// * [validBallots]
/// * [allow]
/// * [retain]
/// * [reason]
@BuiltValue()
abstract class CommunityAppealOutcomeResult implements Built<CommunityAppealOutcomeResult, CommunityAppealOutcomeResultBuilder> {
  @BuiltValueField(wireName: r'policyVersion')
  CommunityAppealOutcomeResultPolicyVersionEnum get policyVersion;
  // enum policyVersionEnum {  lythaus-monthly-rewards-2026-10-v1,  };

  @BuiltValueField(wireName: r'rulesVersion')
  String get rulesVersion;

  @BuiltValueField(wireName: r'status')
  CommunityAppealOutcomeResultStatusEnum get status;
  // enum statusEnum {  resolved_allow,  resolved_retain,  unresolved,  };

  @BuiltValueField(wireName: r'validBallots')
  int get validBallots;

  @BuiltValueField(wireName: r'allow')
  int get allow;

  @BuiltValueField(wireName: r'retain')
  int get retain;

  @BuiltValueField(wireName: r'reason')
  CommunityAppealOutcomeResultReasonEnum get reason;
  // enum reasonEnum {  strict_majority,  tie,  no_quorum,  };

  CommunityAppealOutcomeResult._();

  factory CommunityAppealOutcomeResult([void updates(CommunityAppealOutcomeResultBuilder b)]) = _$CommunityAppealOutcomeResult;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(CommunityAppealOutcomeResultBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<CommunityAppealOutcomeResult> get serializer => _$CommunityAppealOutcomeResultSerializer();
}

class _$CommunityAppealOutcomeResultSerializer implements PrimitiveSerializer<CommunityAppealOutcomeResult> {
  @override
  final Iterable<Type> types = const [CommunityAppealOutcomeResult, _$CommunityAppealOutcomeResult];

  @override
  final String wireName = r'CommunityAppealOutcomeResult';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    CommunityAppealOutcomeResult object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    yield r'policyVersion';
    yield serializers.serialize(
      object.policyVersion,
      specifiedType: const FullType(CommunityAppealOutcomeResultPolicyVersionEnum),
    );
    yield r'rulesVersion';
    yield serializers.serialize(
      object.rulesVersion,
      specifiedType: const FullType(String),
    );
    yield r'status';
    yield serializers.serialize(
      object.status,
      specifiedType: const FullType(CommunityAppealOutcomeResultStatusEnum),
    );
    yield r'validBallots';
    yield serializers.serialize(
      object.validBallots,
      specifiedType: const FullType(int),
    );
    yield r'allow';
    yield serializers.serialize(
      object.allow,
      specifiedType: const FullType(int),
    );
    yield r'retain';
    yield serializers.serialize(
      object.retain,
      specifiedType: const FullType(int),
    );
    yield r'reason';
    yield serializers.serialize(
      object.reason,
      specifiedType: const FullType(CommunityAppealOutcomeResultReasonEnum),
    );
  }

  @override
  Object serialize(
    Serializers serializers,
    CommunityAppealOutcomeResult object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required CommunityAppealOutcomeResultBuilder result,
    required List<Object?> unhandled,
  }) {
    for (var i = 0; i < serializedList.length; i += 2) {
      final key = serializedList[i] as String;
      final value = serializedList[i + 1];
      switch (key) {
        case r'policyVersion':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(CommunityAppealOutcomeResultPolicyVersionEnum),
          ) as CommunityAppealOutcomeResultPolicyVersionEnum;
          result.policyVersion = valueDes;
          break;
        case r'rulesVersion':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.rulesVersion = valueDes;
          break;
        case r'status':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(CommunityAppealOutcomeResultStatusEnum),
          ) as CommunityAppealOutcomeResultStatusEnum;
          result.status = valueDes;
          break;
        case r'validBallots':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(int),
          ) as int;
          result.validBallots = valueDes;
          break;
        case r'allow':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(int),
          ) as int;
          result.allow = valueDes;
          break;
        case r'retain':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(int),
          ) as int;
          result.retain = valueDes;
          break;
        case r'reason':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(CommunityAppealOutcomeResultReasonEnum),
          ) as CommunityAppealOutcomeResultReasonEnum;
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
  CommunityAppealOutcomeResult deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = CommunityAppealOutcomeResultBuilder();
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

class CommunityAppealOutcomeResultPolicyVersionEnum extends EnumClass {

  @BuiltValueEnumConst(wireName: r'lythaus-monthly-rewards-2026-10-v1')
  static const CommunityAppealOutcomeResultPolicyVersionEnum lythausMonthlyRewards202610V1 = _$communityAppealOutcomeResultPolicyVersionEnum_lythausMonthlyRewards202610V1;

  static Serializer<CommunityAppealOutcomeResultPolicyVersionEnum> get serializer => _$communityAppealOutcomeResultPolicyVersionEnumSerializer;

  const CommunityAppealOutcomeResultPolicyVersionEnum._(String name): super(name);

  static BuiltSet<CommunityAppealOutcomeResultPolicyVersionEnum> get values => _$communityAppealOutcomeResultPolicyVersionEnumValues;
  static CommunityAppealOutcomeResultPolicyVersionEnum valueOf(String name) => _$communityAppealOutcomeResultPolicyVersionEnumValueOf(name);
}

class CommunityAppealOutcomeResultStatusEnum extends EnumClass {

  @BuiltValueEnumConst(wireName: r'resolved_allow')
  static const CommunityAppealOutcomeResultStatusEnum resolvedAllow = _$communityAppealOutcomeResultStatusEnum_resolvedAllow;
  @BuiltValueEnumConst(wireName: r'resolved_retain')
  static const CommunityAppealOutcomeResultStatusEnum resolvedRetain = _$communityAppealOutcomeResultStatusEnum_resolvedRetain;
  @BuiltValueEnumConst(wireName: r'unresolved')
  static const CommunityAppealOutcomeResultStatusEnum unresolved = _$communityAppealOutcomeResultStatusEnum_unresolved;

  static Serializer<CommunityAppealOutcomeResultStatusEnum> get serializer => _$communityAppealOutcomeResultStatusEnumSerializer;

  const CommunityAppealOutcomeResultStatusEnum._(String name): super(name);

  static BuiltSet<CommunityAppealOutcomeResultStatusEnum> get values => _$communityAppealOutcomeResultStatusEnumValues;
  static CommunityAppealOutcomeResultStatusEnum valueOf(String name) => _$communityAppealOutcomeResultStatusEnumValueOf(name);
}

class CommunityAppealOutcomeResultReasonEnum extends EnumClass {

  @BuiltValueEnumConst(wireName: r'strict_majority')
  static const CommunityAppealOutcomeResultReasonEnum strictMajority = _$communityAppealOutcomeResultReasonEnum_strictMajority;
  @BuiltValueEnumConst(wireName: r'tie')
  static const CommunityAppealOutcomeResultReasonEnum tie = _$communityAppealOutcomeResultReasonEnum_tie;
  @BuiltValueEnumConst(wireName: r'no_quorum')
  static const CommunityAppealOutcomeResultReasonEnum noQuorum = _$communityAppealOutcomeResultReasonEnum_noQuorum;

  static Serializer<CommunityAppealOutcomeResultReasonEnum> get serializer => _$communityAppealOutcomeResultReasonEnumSerializer;

  const CommunityAppealOutcomeResultReasonEnum._(String name): super(name);

  static BuiltSet<CommunityAppealOutcomeResultReasonEnum> get values => _$communityAppealOutcomeResultReasonEnumValues;
  static CommunityAppealOutcomeResultReasonEnum valueOf(String name) => _$communityAppealOutcomeResultReasonEnumValueOf(name);
}
