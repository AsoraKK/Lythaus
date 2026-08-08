//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:lythaus_api_client/src/model/admin_appeal_detail.dart';
import 'package:lythaus_api_client/src/model/admin_appeal_status_detail.dart';
import 'package:lythaus_api_client/src/model/admin_appeal_vote_summary.dart';
import 'package:lythaus_api_client/src/model/admin_appeal_original_decision.dart';
import 'package:lythaus_api_client/src/model/admin_appeal_content.dart';
import 'package:lythaus_api_client/src/model/admin_appeal_target_type.dart';
import 'package:lythaus_api_client/src/model/admin_appeal_final_decision.dart';
import 'package:lythaus_api_client/src/model/admin_appeal_quorum_summary.dart';
import 'package:lythaus_api_client/src/model/admin_appeal_audit_summary.dart';
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'admin_appeal_detail_response.g.dart';

/// AdminAppealDetailResponse
///
/// Properties:
/// * [appealId]
/// * [targetType]
/// * [targetId]
/// * [status]
/// * [createdAt]
/// * [lastUpdatedAt]
/// * [votes]
/// * [quorum]
/// * [moderatorOverrideAllowed]
/// * [finalDecision]
/// * [auditSummary]
/// * [appeal]
/// * [content]
/// * [originalDecision]
@BuiltValue()
abstract class AdminAppealDetailResponse implements Built<AdminAppealDetailResponse, AdminAppealDetailResponseBuilder> {
  @BuiltValueField(wireName: r'appealId')
  String? get appealId;

  @BuiltValueField(wireName: r'targetType')
  AdminAppealTargetType? get targetType;
  // enum targetTypeEnum {  post,  comment,  profile,  };

  @BuiltValueField(wireName: r'targetId')
  String? get targetId;

  @BuiltValueField(wireName: r'status')
  AdminAppealStatusDetail? get status;
  // enum statusEnum {  pending,  approved,  rejected,  overridden,  };

  @BuiltValueField(wireName: r'createdAt')
  DateTime? get createdAt;

  @BuiltValueField(wireName: r'lastUpdatedAt')
  DateTime? get lastUpdatedAt;

  @BuiltValueField(wireName: r'votes')
  AdminAppealVoteSummary? get votes;

  @BuiltValueField(wireName: r'quorum')
  AdminAppealQuorumSummary? get quorum;

  @BuiltValueField(wireName: r'moderatorOverrideAllowed')
  bool? get moderatorOverrideAllowed;

  @BuiltValueField(wireName: r'finalDecision')
  AdminAppealFinalDecision? get finalDecision;
  // enum finalDecisionEnum {  allow,  block,  };

  @BuiltValueField(wireName: r'auditSummary')
  AdminAppealAuditSummary? get auditSummary;

  @BuiltValueField(wireName: r'appeal')
  AdminAppealDetail? get appeal;

  @BuiltValueField(wireName: r'content')
  AdminAppealContent? get content;

  @BuiltValueField(wireName: r'originalDecision')
  AdminAppealOriginalDecision? get originalDecision;

  AdminAppealDetailResponse._();

  factory AdminAppealDetailResponse([void updates(AdminAppealDetailResponseBuilder b)]) = _$AdminAppealDetailResponse;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(AdminAppealDetailResponseBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<AdminAppealDetailResponse> get serializer => _$AdminAppealDetailResponseSerializer();
}

class _$AdminAppealDetailResponseSerializer implements PrimitiveSerializer<AdminAppealDetailResponse> {
  @override
  final Iterable<Type> types = const [AdminAppealDetailResponse, _$AdminAppealDetailResponse];

  @override
  final String wireName = r'AdminAppealDetailResponse';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    AdminAppealDetailResponse object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    if (object.appealId != null) {
      yield r'appealId';
      yield serializers.serialize(
        object.appealId,
        specifiedType: const FullType(String),
      );
    }
    if (object.targetType != null) {
      yield r'targetType';
      yield serializers.serialize(
        object.targetType,
        specifiedType: const FullType(AdminAppealTargetType),
      );
    }
    if (object.targetId != null) {
      yield r'targetId';
      yield serializers.serialize(
        object.targetId,
        specifiedType: const FullType(String),
      );
    }
    if (object.status != null) {
      yield r'status';
      yield serializers.serialize(
        object.status,
        specifiedType: const FullType(AdminAppealStatusDetail),
      );
    }
    if (object.createdAt != null) {
      yield r'createdAt';
      yield serializers.serialize(
        object.createdAt,
        specifiedType: const FullType(DateTime),
      );
    }
    if (object.lastUpdatedAt != null) {
      yield r'lastUpdatedAt';
      yield serializers.serialize(
        object.lastUpdatedAt,
        specifiedType: const FullType(DateTime),
      );
    }
    if (object.votes != null) {
      yield r'votes';
      yield serializers.serialize(
        object.votes,
        specifiedType: const FullType(AdminAppealVoteSummary),
      );
    }
    if (object.quorum != null) {
      yield r'quorum';
      yield serializers.serialize(
        object.quorum,
        specifiedType: const FullType(AdminAppealQuorumSummary),
      );
    }
    if (object.moderatorOverrideAllowed != null) {
      yield r'moderatorOverrideAllowed';
      yield serializers.serialize(
        object.moderatorOverrideAllowed,
        specifiedType: const FullType(bool),
      );
    }
    if (object.finalDecision != null) {
      yield r'finalDecision';
      yield serializers.serialize(
        object.finalDecision,
        specifiedType: const FullType(AdminAppealFinalDecision),
      );
    }
    if (object.auditSummary != null) {
      yield r'auditSummary';
      yield serializers.serialize(
        object.auditSummary,
        specifiedType: const FullType(AdminAppealAuditSummary),
      );
    }
    if (object.appeal != null) {
      yield r'appeal';
      yield serializers.serialize(
        object.appeal,
        specifiedType: const FullType(AdminAppealDetail),
      );
    }
    if (object.content != null) {
      yield r'content';
      yield serializers.serialize(
        object.content,
        specifiedType: const FullType(AdminAppealContent),
      );
    }
    if (object.originalDecision != null) {
      yield r'originalDecision';
      yield serializers.serialize(
        object.originalDecision,
        specifiedType: const FullType(AdminAppealOriginalDecision),
      );
    }
  }

  @override
  Object serialize(
    Serializers serializers,
    AdminAppealDetailResponse object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required AdminAppealDetailResponseBuilder result,
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
        case r'targetType':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(AdminAppealTargetType),
          ) as AdminAppealTargetType;
          result.targetType = valueDes;
          break;
        case r'targetId':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.targetId = valueDes;
          break;
        case r'status':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(AdminAppealStatusDetail),
          ) as AdminAppealStatusDetail;
          result.status = valueDes;
          break;
        case r'createdAt':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(DateTime),
          ) as DateTime;
          result.createdAt = valueDes;
          break;
        case r'lastUpdatedAt':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(DateTime),
          ) as DateTime;
          result.lastUpdatedAt = valueDes;
          break;
        case r'votes':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(AdminAppealVoteSummary),
          ) as AdminAppealVoteSummary;
          result.votes.replace(valueDes);
          break;
        case r'quorum':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(AdminAppealQuorumSummary),
          ) as AdminAppealQuorumSummary;
          result.quorum.replace(valueDes);
          break;
        case r'moderatorOverrideAllowed':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(bool),
          ) as bool;
          result.moderatorOverrideAllowed = valueDes;
          break;
        case r'finalDecision':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(AdminAppealFinalDecision),
          ) as AdminAppealFinalDecision;
          result.finalDecision = valueDes;
          break;
        case r'auditSummary':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(AdminAppealAuditSummary),
          ) as AdminAppealAuditSummary;
          result.auditSummary.replace(valueDes);
          break;
        case r'appeal':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(AdminAppealDetail),
          ) as AdminAppealDetail;
          result.appeal.replace(valueDes);
          break;
        case r'content':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(AdminAppealContent),
          ) as AdminAppealContent;
          result.content.replace(valueDes);
          break;
        case r'originalDecision':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(AdminAppealOriginalDecision),
          ) as AdminAppealOriginalDecision;
          result.originalDecision.replace(valueDes);
          break;
        default:
          unhandled.add(key);
          unhandled.add(value);
          break;
      }
    }
  }

  @override
  AdminAppealDetailResponse deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = AdminAppealDetailResponseBuilder();
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
