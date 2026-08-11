//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:built_collection/built_collection.dart';
import 'package:lythaus_api_client/src/model/appeal_outcome.dart';
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'appeal_adjudication_response.g.dart';

/// AppealAdjudicationResponse
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
/// * [appealId]
@BuiltValue()
abstract class AppealAdjudicationResponse implements AppealOutcome, Built<AppealAdjudicationResponse, AppealAdjudicationResponseBuilder> {
  @BuiltValueField(wireName: r'appealId')
  String get appealId;

  AppealAdjudicationResponse._();

  factory AppealAdjudicationResponse([void updates(AppealAdjudicationResponseBuilder b)]) = _$AppealAdjudicationResponse;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(AppealAdjudicationResponseBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<AppealAdjudicationResponse> get serializer => _$AppealAdjudicationResponseSerializer();
}

class _$AppealAdjudicationResponseSerializer implements PrimitiveSerializer<AppealAdjudicationResponse> {
  @override
  final Iterable<Type> types = const [AppealAdjudicationResponse, _$AppealAdjudicationResponse];

  @override
  final String wireName = r'AppealAdjudicationResponse';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    AppealAdjudicationResponse object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    yield r'policyVersion';
    yield serializers.serialize(
      object.policyVersion,
      specifiedType: const FullType(String),
    );
    if (object.reviewerPanelDecision != null) {
      yield r'reviewerPanelDecision';
      yield serializers.serialize(
        object.reviewerPanelDecision,
        specifiedType: const FullType.nullable(AppealOutcomeReviewerPanelDecisionEnum),
      );
    }
    yield r'upholdWeight';
    yield serializers.serialize(
      object.upholdWeight,
      specifiedType: const FullType(int),
    );
    yield r'requiredAdjudicators';
    yield serializers.serialize(
      object.requiredAdjudicators,
      specifiedType: const FullType(AppealOutcomeRequiredAdjudicatorsEnum),
    );
    yield r'totalWeight';
    yield serializers.serialize(
      object.totalWeight,
      specifiedType: const FullType(int),
    );
    if (object.finalDecision != null) {
      yield r'finalDecision';
      yield serializers.serialize(
        object.finalDecision,
        specifiedType: const FullType.nullable(AppealOutcomeFinalDecisionEnum),
      );
    }
    yield r'winningShare';
    yield serializers.serialize(
      object.winningShare,
      specifiedType: const FullType(num),
    );
    yield r'appealId';
    yield serializers.serialize(
      object.appealId,
      specifiedType: const FullType(String),
    );
    yield r'overturnWeight';
    yield serializers.serialize(
      object.overturnWeight,
      specifiedType: const FullType(int),
    );
    yield r'completedReviewers';
    yield serializers.serialize(
      object.completedReviewers,
      specifiedType: const FullType(int),
    );
    yield r'status';
    yield serializers.serialize(
      object.status,
      specifiedType: const FullType(AppealOutcomeStatusEnum),
    );
  }

  @override
  Object serialize(
    Serializers serializers,
    AppealAdjudicationResponse object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required AppealAdjudicationResponseBuilder result,
    required List<Object?> unhandled,
  }) {
    for (var i = 0; i < serializedList.length; i += 2) {
      final key = serializedList[i] as String;
      final value = serializedList[i + 1];
      switch (key) {
        case r'policyVersion':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.policyVersion = valueDes;
          break;
        case r'reviewerPanelDecision':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType.nullable(AppealOutcomeReviewerPanelDecisionEnum),
          ) as AppealOutcomeReviewerPanelDecisionEnum?;
          if (valueDes == null) continue;
          result.reviewerPanelDecision = valueDes;
          break;
        case r'upholdWeight':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(int),
          ) as int;
          result.upholdWeight = valueDes;
          break;
        case r'requiredAdjudicators':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(AppealOutcomeRequiredAdjudicatorsEnum),
          ) as AppealOutcomeRequiredAdjudicatorsEnum;
          result.requiredAdjudicators = valueDes;
          break;
        case r'totalWeight':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(int),
          ) as int;
          result.totalWeight = valueDes;
          break;
        case r'finalDecision':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType.nullable(AppealOutcomeFinalDecisionEnum),
          ) as AppealOutcomeFinalDecisionEnum?;
          if (valueDes == null) continue;
          result.finalDecision = valueDes;
          break;
        case r'winningShare':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(num),
          ) as num;
          result.winningShare = valueDes;
          break;
        case r'appealId':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.appealId = valueDes;
          break;
        case r'overturnWeight':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(int),
          ) as int;
          result.overturnWeight = valueDes;
          break;
        case r'completedReviewers':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(int),
          ) as int;
          result.completedReviewers = valueDes;
          break;
        case r'status':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(AppealOutcomeStatusEnum),
          ) as AppealOutcomeStatusEnum;
          result.status = valueDes;
          break;
        default:
          unhandled.add(key);
          unhandled.add(value);
          break;
      }
    }
  }

  @override
  AppealAdjudicationResponse deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = AppealAdjudicationResponseBuilder();
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

class AppealAdjudicationResponseStatusEnum extends EnumClass {

  @BuiltValueEnumConst(wireName: r'pending_quorum')
  static const AppealAdjudicationResponseStatusEnum pendingQuorum = _$appealAdjudicationResponseStatusEnum_pendingQuorum;
  @BuiltValueEnumConst(wireName: r'no_consensus')
  static const AppealAdjudicationResponseStatusEnum noConsensus = _$appealAdjudicationResponseStatusEnum_noConsensus;
  @BuiltValueEnumConst(wireName: r'pending_adjudication')
  static const AppealAdjudicationResponseStatusEnum pendingAdjudication = _$appealAdjudicationResponseStatusEnum_pendingAdjudication;
  @BuiltValueEnumConst(wireName: r'adjudication_disagreement')
  static const AppealAdjudicationResponseStatusEnum adjudicationDisagreement = _$appealAdjudicationResponseStatusEnum_adjudicationDisagreement;
  @BuiltValueEnumConst(wireName: r'resolved')
  static const AppealAdjudicationResponseStatusEnum resolved = _$appealAdjudicationResponseStatusEnum_resolved;

  static Serializer<AppealAdjudicationResponseStatusEnum> get serializer => _$appealAdjudicationResponseStatusEnumSerializer;

  const AppealAdjudicationResponseStatusEnum._(String name): super(name);

  static BuiltSet<AppealAdjudicationResponseStatusEnum> get values => _$appealAdjudicationResponseStatusEnumValues;
  static AppealAdjudicationResponseStatusEnum valueOf(String name) => _$appealAdjudicationResponseStatusEnumValueOf(name);
}

class AppealAdjudicationResponseReviewerPanelDecisionEnum extends EnumClass {

  @BuiltValueEnumConst(wireName: r'overturn')
  static const AppealAdjudicationResponseReviewerPanelDecisionEnum overturn = _$appealAdjudicationResponseReviewerPanelDecisionEnum_overturn;
  @BuiltValueEnumConst(wireName: r'uphold')
  static const AppealAdjudicationResponseReviewerPanelDecisionEnum uphold = _$appealAdjudicationResponseReviewerPanelDecisionEnum_uphold;

  static Serializer<AppealAdjudicationResponseReviewerPanelDecisionEnum> get serializer => _$appealAdjudicationResponseReviewerPanelDecisionEnumSerializer;

  const AppealAdjudicationResponseReviewerPanelDecisionEnum._(String name): super(name);

  static BuiltSet<AppealAdjudicationResponseReviewerPanelDecisionEnum> get values => _$appealAdjudicationResponseReviewerPanelDecisionEnumValues;
  static AppealAdjudicationResponseReviewerPanelDecisionEnum valueOf(String name) => _$appealAdjudicationResponseReviewerPanelDecisionEnumValueOf(name);
}

class AppealAdjudicationResponseFinalDecisionEnum extends EnumClass {

  @BuiltValueEnumConst(wireName: r'overturn')
  static const AppealAdjudicationResponseFinalDecisionEnum overturn = _$appealAdjudicationResponseFinalDecisionEnum_overturn;
  @BuiltValueEnumConst(wireName: r'uphold')
  static const AppealAdjudicationResponseFinalDecisionEnum uphold = _$appealAdjudicationResponseFinalDecisionEnum_uphold;

  static Serializer<AppealAdjudicationResponseFinalDecisionEnum> get serializer => _$appealAdjudicationResponseFinalDecisionEnumSerializer;

  const AppealAdjudicationResponseFinalDecisionEnum._(String name): super(name);

  static BuiltSet<AppealAdjudicationResponseFinalDecisionEnum> get values => _$appealAdjudicationResponseFinalDecisionEnumValues;
  static AppealAdjudicationResponseFinalDecisionEnum valueOf(String name) => _$appealAdjudicationResponseFinalDecisionEnumValueOf(name);
}

class AppealAdjudicationResponseRequiredAdjudicatorsEnum extends EnumClass {

  @BuiltValueEnumConst(wireNumber: 1)
  static const AppealAdjudicationResponseRequiredAdjudicatorsEnum number1 = _$appealAdjudicationResponseRequiredAdjudicatorsEnum_number1;
  @BuiltValueEnumConst(wireNumber: 2)
  static const AppealAdjudicationResponseRequiredAdjudicatorsEnum number2 = _$appealAdjudicationResponseRequiredAdjudicatorsEnum_number2;

  static Serializer<AppealAdjudicationResponseRequiredAdjudicatorsEnum> get serializer => _$appealAdjudicationResponseRequiredAdjudicatorsEnumSerializer;

  const AppealAdjudicationResponseRequiredAdjudicatorsEnum._(String name): super(name);

  static BuiltSet<AppealAdjudicationResponseRequiredAdjudicatorsEnum> get values => _$appealAdjudicationResponseRequiredAdjudicatorsEnumValues;
  static AppealAdjudicationResponseRequiredAdjudicatorsEnum valueOf(String name) => _$appealAdjudicationResponseRequiredAdjudicatorsEnumValueOf(name);
}
