//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:built_collection/built_collection.dart';
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'appeal_detail.g.dart';

/// AppealDetail
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
/// * [communityDecision]
/// * [finalDecision]
/// * [completedReviewers]
/// * [outcomeState]
/// * [reviewerAssigned]
/// * [reviewerDecision]
@BuiltValue()
abstract class AppealDetail implements Built<AppealDetail, AppealDetailBuilder> {
  @BuiltValueField(wireName: r'id')
  String get id;

  @BuiltValueField(wireName: r'case_id')
  String get caseId;

  @BuiltValueField(wireName: r'state')
  AppealDetailStateEnum get state;
  // enum stateEnum {  open,  resolved,  };

  @BuiltValueField(wireName: r'risk_class')
  AppealDetailRiskClassEnum get riskClass;
  // enum riskClassEnum {  standard,  high,  };

  @BuiltValueField(wireName: r'policy_version')
  String get policyVersion;

  @BuiltValueField(wireName: r'created_at')
  DateTime get createdAt;

  @BuiltValueField(wireName: r'expires_at')
  DateTime? get expiresAt;

  @BuiltValueField(wireName: r'resolved_at')
  DateTime? get resolvedAt;

  @BuiltValueField(wireName: r'community_decision')
  AppealDetailCommunityDecisionEnum? get communityDecision;
  // enum communityDecisionEnum {  overturn,  uphold,  };

  @BuiltValueField(wireName: r'final_decision')
  AppealDetailFinalDecisionEnum? get finalDecision;
  // enum finalDecisionEnum {  overturn,  uphold,  };

  @BuiltValueField(wireName: r'completed_reviewers')
  int? get completedReviewers;

  @BuiltValueField(wireName: r'outcome_state')
  String? get outcomeState;

  @BuiltValueField(wireName: r'reviewer_assigned')
  bool? get reviewerAssigned;

  @BuiltValueField(wireName: r'reviewer_decision')
  AppealDetailReviewerDecisionEnum? get reviewerDecision;
  // enum reviewerDecisionEnum {  overturn,  uphold,  };

  AppealDetail._();

  factory AppealDetail([void updates(AppealDetailBuilder b)]) = _$AppealDetail;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(AppealDetailBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<AppealDetail> get serializer => _$AppealDetailSerializer();
}

class _$AppealDetailSerializer implements PrimitiveSerializer<AppealDetail> {
  @override
  final Iterable<Type> types = const [AppealDetail, _$AppealDetail];

  @override
  final String wireName = r'AppealDetail';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    AppealDetail object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    yield r'id';
    yield serializers.serialize(
      object.id,
      specifiedType: const FullType(String),
    );
    yield r'case_id';
    yield serializers.serialize(
      object.caseId,
      specifiedType: const FullType(String),
    );
    yield r'state';
    yield serializers.serialize(
      object.state,
      specifiedType: const FullType(AppealDetailStateEnum),
    );
    yield r'risk_class';
    yield serializers.serialize(
      object.riskClass,
      specifiedType: const FullType(AppealDetailRiskClassEnum),
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
    if (object.expiresAt != null) {
      yield r'expires_at';
      yield serializers.serialize(
        object.expiresAt,
        specifiedType: const FullType.nullable(DateTime),
      );
    }
    if (object.resolvedAt != null) {
      yield r'resolved_at';
      yield serializers.serialize(
        object.resolvedAt,
        specifiedType: const FullType.nullable(DateTime),
      );
    }
    if (object.communityDecision != null) {
      yield r'community_decision';
      yield serializers.serialize(
        object.communityDecision,
        specifiedType: const FullType.nullable(AppealDetailCommunityDecisionEnum),
      );
    }
    if (object.finalDecision != null) {
      yield r'final_decision';
      yield serializers.serialize(
        object.finalDecision,
        specifiedType: const FullType.nullable(AppealDetailFinalDecisionEnum),
      );
    }
    if (object.completedReviewers != null) {
      yield r'completed_reviewers';
      yield serializers.serialize(
        object.completedReviewers,
        specifiedType: const FullType.nullable(int),
      );
    }
    if (object.outcomeState != null) {
      yield r'outcome_state';
      yield serializers.serialize(
        object.outcomeState,
        specifiedType: const FullType.nullable(String),
      );
    }
    if (object.reviewerAssigned != null) {
      yield r'reviewer_assigned';
      yield serializers.serialize(
        object.reviewerAssigned,
        specifiedType: const FullType(bool),
      );
    }
    if (object.reviewerDecision != null) {
      yield r'reviewer_decision';
      yield serializers.serialize(
        object.reviewerDecision,
        specifiedType: const FullType.nullable(AppealDetailReviewerDecisionEnum),
      );
    }
  }

  @override
  Object serialize(
    Serializers serializers,
    AppealDetail object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required AppealDetailBuilder result,
    required List<Object?> unhandled,
  }) {
    for (var i = 0; i < serializedList.length; i += 2) {
      final key = serializedList[i] as String;
      final value = serializedList[i + 1];
      switch (key) {
        case r'id':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.id = valueDes;
          break;
        case r'case_id':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.caseId = valueDes;
          break;
        case r'state':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(AppealDetailStateEnum),
          ) as AppealDetailStateEnum;
          result.state = valueDes;
          break;
        case r'risk_class':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(AppealDetailRiskClassEnum),
          ) as AppealDetailRiskClassEnum;
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
            specifiedType: const FullType.nullable(DateTime),
          ) as DateTime?;
          if (valueDes == null) continue;
          result.expiresAt = valueDes;
          break;
        case r'resolved_at':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType.nullable(DateTime),
          ) as DateTime?;
          if (valueDes == null) continue;
          result.resolvedAt = valueDes;
          break;
        case r'community_decision':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType.nullable(AppealDetailCommunityDecisionEnum),
          ) as AppealDetailCommunityDecisionEnum?;
          if (valueDes == null) continue;
          result.communityDecision = valueDes;
          break;
        case r'final_decision':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType.nullable(AppealDetailFinalDecisionEnum),
          ) as AppealDetailFinalDecisionEnum?;
          if (valueDes == null) continue;
          result.finalDecision = valueDes;
          break;
        case r'completed_reviewers':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType.nullable(int),
          ) as int?;
          if (valueDes == null) continue;
          result.completedReviewers = valueDes;
          break;
        case r'outcome_state':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType.nullable(String),
          ) as String?;
          if (valueDes == null) continue;
          result.outcomeState = valueDes;
          break;
        case r'reviewer_assigned':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(bool),
          ) as bool;
          result.reviewerAssigned = valueDes;
          break;
        case r'reviewer_decision':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType.nullable(AppealDetailReviewerDecisionEnum),
          ) as AppealDetailReviewerDecisionEnum?;
          if (valueDes == null) continue;
          result.reviewerDecision = valueDes;
          break;
        default:
          unhandled.add(key);
          unhandled.add(value);
          break;
      }
    }
  }

  @override
  AppealDetail deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = AppealDetailBuilder();
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

class AppealDetailStateEnum extends EnumClass {

  @BuiltValueEnumConst(wireName: r'open')
  static const AppealDetailStateEnum open = _$appealDetailStateEnum_open;
  @BuiltValueEnumConst(wireName: r'resolved')
  static const AppealDetailStateEnum resolved = _$appealDetailStateEnum_resolved;

  static Serializer<AppealDetailStateEnum> get serializer => _$appealDetailStateEnumSerializer;

  const AppealDetailStateEnum._(String name): super(name);

  static BuiltSet<AppealDetailStateEnum> get values => _$appealDetailStateEnumValues;
  static AppealDetailStateEnum valueOf(String name) => _$appealDetailStateEnumValueOf(name);
}

class AppealDetailRiskClassEnum extends EnumClass {

  @BuiltValueEnumConst(wireName: r'standard')
  static const AppealDetailRiskClassEnum standard = _$appealDetailRiskClassEnum_standard;
  @BuiltValueEnumConst(wireName: r'high')
  static const AppealDetailRiskClassEnum high = _$appealDetailRiskClassEnum_high;

  static Serializer<AppealDetailRiskClassEnum> get serializer => _$appealDetailRiskClassEnumSerializer;

  const AppealDetailRiskClassEnum._(String name): super(name);

  static BuiltSet<AppealDetailRiskClassEnum> get values => _$appealDetailRiskClassEnumValues;
  static AppealDetailRiskClassEnum valueOf(String name) => _$appealDetailRiskClassEnumValueOf(name);
}

class AppealDetailCommunityDecisionEnum extends EnumClass {

  @BuiltValueEnumConst(wireName: r'overturn')
  static const AppealDetailCommunityDecisionEnum overturn = _$appealDetailCommunityDecisionEnum_overturn;
  @BuiltValueEnumConst(wireName: r'uphold')
  static const AppealDetailCommunityDecisionEnum uphold = _$appealDetailCommunityDecisionEnum_uphold;

  static Serializer<AppealDetailCommunityDecisionEnum> get serializer => _$appealDetailCommunityDecisionEnumSerializer;

  const AppealDetailCommunityDecisionEnum._(String name): super(name);

  static BuiltSet<AppealDetailCommunityDecisionEnum> get values => _$appealDetailCommunityDecisionEnumValues;
  static AppealDetailCommunityDecisionEnum valueOf(String name) => _$appealDetailCommunityDecisionEnumValueOf(name);
}

class AppealDetailFinalDecisionEnum extends EnumClass {

  @BuiltValueEnumConst(wireName: r'overturn')
  static const AppealDetailFinalDecisionEnum overturn = _$appealDetailFinalDecisionEnum_overturn;
  @BuiltValueEnumConst(wireName: r'uphold')
  static const AppealDetailFinalDecisionEnum uphold = _$appealDetailFinalDecisionEnum_uphold;

  static Serializer<AppealDetailFinalDecisionEnum> get serializer => _$appealDetailFinalDecisionEnumSerializer;

  const AppealDetailFinalDecisionEnum._(String name): super(name);

  static BuiltSet<AppealDetailFinalDecisionEnum> get values => _$appealDetailFinalDecisionEnumValues;
  static AppealDetailFinalDecisionEnum valueOf(String name) => _$appealDetailFinalDecisionEnumValueOf(name);
}

class AppealDetailReviewerDecisionEnum extends EnumClass {

  @BuiltValueEnumConst(wireName: r'overturn')
  static const AppealDetailReviewerDecisionEnum overturn = _$appealDetailReviewerDecisionEnum_overturn;
  @BuiltValueEnumConst(wireName: r'uphold')
  static const AppealDetailReviewerDecisionEnum uphold = _$appealDetailReviewerDecisionEnum_uphold;

  static Serializer<AppealDetailReviewerDecisionEnum> get serializer => _$appealDetailReviewerDecisionEnumSerializer;

  const AppealDetailReviewerDecisionEnum._(String name): super(name);

  static BuiltSet<AppealDetailReviewerDecisionEnum> get values => _$appealDetailReviewerDecisionEnumValues;
  static AppealDetailReviewerDecisionEnum valueOf(String name) => _$appealDetailReviewerDecisionEnumValueOf(name);
}
