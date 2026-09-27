//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:lythaus_api_client/src/model/beta_review.dart';
import 'package:built_collection/built_collection.dart';
import 'package:built_value/json_object.dart';
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'beta_admin_case.g.dart';

/// BetaAdminCase
///
/// Properties:
/// * [schemaVersion]
/// * [caseId]
/// * [status]
/// * [createdAt]
/// * [updatedAt]
/// * [expiresAt]
/// * [reviewState]
/// * [finding]
/// * [explanation]
/// * [advisoryStatus]
/// * [limitations]
/// * [versions]
/// * [publicationEligible]
/// * [rewardsEligible]
/// * [reviews]
/// * [feedback]
/// * [diagnostics]
@BuiltValue()
abstract class BetaAdminCase implements Built<BetaAdminCase, BetaAdminCaseBuilder> {
  @BuiltValueField(wireName: r'schemaVersion')
  String? get schemaVersion;

  @BuiltValueField(wireName: r'caseId')
  String? get caseId;

  @BuiltValueField(wireName: r'status')
  BetaAdminCaseStatusEnum? get status;
  // enum statusEnum {  uploading,  queued,  analyzing,  complete,  inconclusive,  unsupported,  failed,  paused,  safety_review,  safety_blocked,  cancelled,  expired,  deleted,  };

  @BuiltValueField(wireName: r'createdAt')
  DateTime? get createdAt;

  @BuiltValueField(wireName: r'updatedAt')
  DateTime? get updatedAt;

  @BuiltValueField(wireName: r'expiresAt')
  DateTime? get expiresAt;

  @BuiltValueField(wireName: r'reviewState')
  BetaAdminCaseReviewStateEnum? get reviewState;
  // enum reviewStateEnum {  none,  requested,  reviewed,  };

  @BuiltValueField(wireName: r'finding')
  BetaAdminCaseFindingEnum? get finding;
  // enum findingEnum {  SYNTHETIC_LIKE_EVIDENCE,  NO_POSITIVE_SAFE_EVIDENCE,  INCONCLUSIVE,  UNAVAILABLE,  };

  @BuiltValueField(wireName: r'explanation')
  String? get explanation;

  @BuiltValueField(wireName: r'advisoryStatus')
  String? get advisoryStatus;

  @BuiltValueField(wireName: r'limitations')
  BuiltList<String>? get limitations;

  @BuiltValueField(wireName: r'versions')
  BuiltMap<String, String>? get versions;

  @BuiltValueField(wireName: r'publicationEligible')
  bool? get publicationEligible;

  @BuiltValueField(wireName: r'rewardsEligible')
  bool? get rewardsEligible;

  @BuiltValueField(wireName: r'reviews')
  BuiltList<BetaReview>? get reviews;

  @BuiltValueField(wireName: r'feedback')
  BuiltList<BuiltMap<String, JsonObject?>>? get feedback;

  @BuiltValueField(wireName: r'diagnostics')
  BuiltMap<String, JsonObject?>? get diagnostics;

  BetaAdminCase._();

  factory BetaAdminCase([void updates(BetaAdminCaseBuilder b)]) = _$BetaAdminCase;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(BetaAdminCaseBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<BetaAdminCase> get serializer => _$BetaAdminCaseSerializer();
}

class _$BetaAdminCaseSerializer implements PrimitiveSerializer<BetaAdminCase> {
  @override
  final Iterable<Type> types = const [BetaAdminCase, _$BetaAdminCase];

  @override
  final String wireName = r'BetaAdminCase';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    BetaAdminCase object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    if (object.schemaVersion != null) {
      yield r'schemaVersion';
      yield serializers.serialize(
        object.schemaVersion,
        specifiedType: const FullType(String),
      );
    }
    if (object.caseId != null) {
      yield r'caseId';
      yield serializers.serialize(
        object.caseId,
        specifiedType: const FullType(String),
      );
    }
    if (object.status != null) {
      yield r'status';
      yield serializers.serialize(
        object.status,
        specifiedType: const FullType(BetaAdminCaseStatusEnum),
      );
    }
    if (object.createdAt != null) {
      yield r'createdAt';
      yield serializers.serialize(
        object.createdAt,
        specifiedType: const FullType(DateTime),
      );
    }
    if (object.updatedAt != null) {
      yield r'updatedAt';
      yield serializers.serialize(
        object.updatedAt,
        specifiedType: const FullType(DateTime),
      );
    }
    if (object.expiresAt != null) {
      yield r'expiresAt';
      yield serializers.serialize(
        object.expiresAt,
        specifiedType: const FullType(DateTime),
      );
    }
    if (object.reviewState != null) {
      yield r'reviewState';
      yield serializers.serialize(
        object.reviewState,
        specifiedType: const FullType(BetaAdminCaseReviewStateEnum),
      );
    }
    if (object.finding != null) {
      yield r'finding';
      yield serializers.serialize(
        object.finding,
        specifiedType: const FullType(BetaAdminCaseFindingEnum),
      );
    }
    if (object.explanation != null) {
      yield r'explanation';
      yield serializers.serialize(
        object.explanation,
        specifiedType: const FullType(String),
      );
    }
    if (object.advisoryStatus != null) {
      yield r'advisoryStatus';
      yield serializers.serialize(
        object.advisoryStatus,
        specifiedType: const FullType(String),
      );
    }
    if (object.limitations != null) {
      yield r'limitations';
      yield serializers.serialize(
        object.limitations,
        specifiedType: const FullType(BuiltList, [FullType(String)]),
      );
    }
    if (object.versions != null) {
      yield r'versions';
      yield serializers.serialize(
        object.versions,
        specifiedType: const FullType(BuiltMap, [FullType(String), FullType(String)]),
      );
    }
    if (object.publicationEligible != null) {
      yield r'publicationEligible';
      yield serializers.serialize(
        object.publicationEligible,
        specifiedType: const FullType(bool),
      );
    }
    if (object.rewardsEligible != null) {
      yield r'rewardsEligible';
      yield serializers.serialize(
        object.rewardsEligible,
        specifiedType: const FullType(bool),
      );
    }
    if (object.reviews != null) {
      yield r'reviews';
      yield serializers.serialize(
        object.reviews,
        specifiedType: const FullType(BuiltList, [FullType(BetaReview)]),
      );
    }
    if (object.feedback != null) {
      yield r'feedback';
      yield serializers.serialize(
        object.feedback,
        specifiedType: const FullType(BuiltList, [FullType(BuiltMap, [FullType(String), FullType.nullable(JsonObject)])]),
      );
    }
    if (object.diagnostics != null) {
      yield r'diagnostics';
      yield serializers.serialize(
        object.diagnostics,
        specifiedType: const FullType(BuiltMap, [FullType(String), FullType.nullable(JsonObject)]),
      );
    }
  }

  @override
  Object serialize(
    Serializers serializers,
    BetaAdminCase object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required BetaAdminCaseBuilder result,
    required List<Object?> unhandled,
  }) {
    for (var i = 0; i < serializedList.length; i += 2) {
      final key = serializedList[i] as String;
      final value = serializedList[i + 1];
      switch (key) {
        case r'schemaVersion':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.schemaVersion = valueDes;
          break;
        case r'caseId':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.caseId = valueDes;
          break;
        case r'status':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(BetaAdminCaseStatusEnum),
          ) as BetaAdminCaseStatusEnum;
          result.status = valueDes;
          break;
        case r'createdAt':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(DateTime),
          ) as DateTime;
          result.createdAt = valueDes;
          break;
        case r'updatedAt':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(DateTime),
          ) as DateTime;
          result.updatedAt = valueDes;
          break;
        case r'expiresAt':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(DateTime),
          ) as DateTime;
          result.expiresAt = valueDes;
          break;
        case r'reviewState':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(BetaAdminCaseReviewStateEnum),
          ) as BetaAdminCaseReviewStateEnum;
          result.reviewState = valueDes;
          break;
        case r'finding':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(BetaAdminCaseFindingEnum),
          ) as BetaAdminCaseFindingEnum;
          result.finding = valueDes;
          break;
        case r'explanation':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.explanation = valueDes;
          break;
        case r'advisoryStatus':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.advisoryStatus = valueDes;
          break;
        case r'limitations':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(BuiltList, [FullType(String)]),
          ) as BuiltList<String>;
          result.limitations.replace(valueDes);
          break;
        case r'versions':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(BuiltMap, [FullType(String), FullType(String)]),
          ) as BuiltMap<String, String>;
          result.versions.replace(valueDes);
          break;
        case r'publicationEligible':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(bool),
          ) as bool;
          result.publicationEligible = valueDes;
          break;
        case r'rewardsEligible':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(bool),
          ) as bool;
          result.rewardsEligible = valueDes;
          break;
        case r'reviews':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(BuiltList, [FullType(BetaReview)]),
          ) as BuiltList<BetaReview>;
          result.reviews.replace(valueDes);
          break;
        case r'feedback':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(BuiltList, [FullType(BuiltMap, [FullType(String), FullType.nullable(JsonObject)])]),
          ) as BuiltList<BuiltMap<String, JsonObject?>>;
          result.feedback.replace(valueDes);
          break;
        case r'diagnostics':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(BuiltMap, [FullType(String), FullType.nullable(JsonObject)]),
          ) as BuiltMap<String, JsonObject?>;
          result.diagnostics.replace(valueDes);
          break;
        default:
          unhandled.add(key);
          unhandled.add(value);
          break;
      }
    }
  }

  @override
  BetaAdminCase deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = BetaAdminCaseBuilder();
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

class BetaAdminCaseStatusEnum extends EnumClass {

  @BuiltValueEnumConst(wireName: r'uploading')
  static const BetaAdminCaseStatusEnum uploading = _$betaAdminCaseStatusEnum_uploading;
  @BuiltValueEnumConst(wireName: r'queued')
  static const BetaAdminCaseStatusEnum queued = _$betaAdminCaseStatusEnum_queued;
  @BuiltValueEnumConst(wireName: r'analyzing')
  static const BetaAdminCaseStatusEnum analyzing = _$betaAdminCaseStatusEnum_analyzing;
  @BuiltValueEnumConst(wireName: r'complete')
  static const BetaAdminCaseStatusEnum complete = _$betaAdminCaseStatusEnum_complete;
  @BuiltValueEnumConst(wireName: r'inconclusive')
  static const BetaAdminCaseStatusEnum inconclusive = _$betaAdminCaseStatusEnum_inconclusive;
  @BuiltValueEnumConst(wireName: r'unsupported')
  static const BetaAdminCaseStatusEnum unsupported = _$betaAdminCaseStatusEnum_unsupported;
  @BuiltValueEnumConst(wireName: r'failed')
  static const BetaAdminCaseStatusEnum failed = _$betaAdminCaseStatusEnum_failed;
  @BuiltValueEnumConst(wireName: r'paused')
  static const BetaAdminCaseStatusEnum paused = _$betaAdminCaseStatusEnum_paused;
  @BuiltValueEnumConst(wireName: r'safety_review')
  static const BetaAdminCaseStatusEnum safetyReview = _$betaAdminCaseStatusEnum_safetyReview;
  @BuiltValueEnumConst(wireName: r'safety_blocked')
  static const BetaAdminCaseStatusEnum safetyBlocked = _$betaAdminCaseStatusEnum_safetyBlocked;
  @BuiltValueEnumConst(wireName: r'cancelled')
  static const BetaAdminCaseStatusEnum cancelled = _$betaAdminCaseStatusEnum_cancelled;
  @BuiltValueEnumConst(wireName: r'expired')
  static const BetaAdminCaseStatusEnum expired = _$betaAdminCaseStatusEnum_expired;
  @BuiltValueEnumConst(wireName: r'deleted')
  static const BetaAdminCaseStatusEnum deleted = _$betaAdminCaseStatusEnum_deleted;

  static Serializer<BetaAdminCaseStatusEnum> get serializer => _$betaAdminCaseStatusEnumSerializer;

  const BetaAdminCaseStatusEnum._(String name): super(name);

  static BuiltSet<BetaAdminCaseStatusEnum> get values => _$betaAdminCaseStatusEnumValues;
  static BetaAdminCaseStatusEnum valueOf(String name) => _$betaAdminCaseStatusEnumValueOf(name);
}

class BetaAdminCaseReviewStateEnum extends EnumClass {

  @BuiltValueEnumConst(wireName: r'none')
  static const BetaAdminCaseReviewStateEnum none = _$betaAdminCaseReviewStateEnum_none;
  @BuiltValueEnumConst(wireName: r'requested')
  static const BetaAdminCaseReviewStateEnum requested = _$betaAdminCaseReviewStateEnum_requested;
  @BuiltValueEnumConst(wireName: r'reviewed')
  static const BetaAdminCaseReviewStateEnum reviewed = _$betaAdminCaseReviewStateEnum_reviewed;

  static Serializer<BetaAdminCaseReviewStateEnum> get serializer => _$betaAdminCaseReviewStateEnumSerializer;

  const BetaAdminCaseReviewStateEnum._(String name): super(name);

  static BuiltSet<BetaAdminCaseReviewStateEnum> get values => _$betaAdminCaseReviewStateEnumValues;
  static BetaAdminCaseReviewStateEnum valueOf(String name) => _$betaAdminCaseReviewStateEnumValueOf(name);
}

class BetaAdminCaseFindingEnum extends EnumClass {

  @BuiltValueEnumConst(wireName: r'SYNTHETIC_LIKE_EVIDENCE')
  static const BetaAdminCaseFindingEnum SYNTHETIC_LIKE_EVIDENCE = _$betaAdminCaseFindingEnum_SYNTHETIC_LIKE_EVIDENCE;
  @BuiltValueEnumConst(wireName: r'NO_POSITIVE_SAFE_EVIDENCE')
  static const BetaAdminCaseFindingEnum NO_POSITIVE_SAFE_EVIDENCE = _$betaAdminCaseFindingEnum_NO_POSITIVE_SAFE_EVIDENCE;
  @BuiltValueEnumConst(wireName: r'INCONCLUSIVE')
  static const BetaAdminCaseFindingEnum INCONCLUSIVE = _$betaAdminCaseFindingEnum_INCONCLUSIVE;
  @BuiltValueEnumConst(wireName: r'UNAVAILABLE')
  static const BetaAdminCaseFindingEnum UNAVAILABLE = _$betaAdminCaseFindingEnum_UNAVAILABLE;

  static Serializer<BetaAdminCaseFindingEnum> get serializer => _$betaAdminCaseFindingEnumSerializer;

  const BetaAdminCaseFindingEnum._(String name): super(name);

  static BuiltSet<BetaAdminCaseFindingEnum> get values => _$betaAdminCaseFindingEnumValues;
  static BetaAdminCaseFindingEnum valueOf(String name) => _$betaAdminCaseFindingEnumValueOf(name);
}
