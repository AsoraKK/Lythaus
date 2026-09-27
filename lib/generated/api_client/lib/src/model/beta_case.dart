//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:lythaus_api_client/src/model/beta_review.dart';
import 'package:built_collection/built_collection.dart';
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'beta_case.g.dart';

/// BetaCase
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
@BuiltValue()
abstract class BetaCase implements Built<BetaCase, BetaCaseBuilder> {
  @BuiltValueField(wireName: r'schemaVersion')
  String get schemaVersion;

  @BuiltValueField(wireName: r'caseId')
  String get caseId;

  @BuiltValueField(wireName: r'status')
  BetaCaseStatusEnum get status;
  // enum statusEnum {  uploading,  queued,  analyzing,  complete,  inconclusive,  unsupported,  failed,  paused,  safety_review,  safety_blocked,  cancelled,  expired,  deleted,  };

  @BuiltValueField(wireName: r'createdAt')
  DateTime get createdAt;

  @BuiltValueField(wireName: r'updatedAt')
  DateTime get updatedAt;

  @BuiltValueField(wireName: r'expiresAt')
  DateTime get expiresAt;

  @BuiltValueField(wireName: r'reviewState')
  BetaCaseReviewStateEnum get reviewState;
  // enum reviewStateEnum {  none,  requested,  reviewed,  };

  @BuiltValueField(wireName: r'finding')
  BetaCaseFindingEnum get finding;
  // enum findingEnum {  SYNTHETIC_LIKE_EVIDENCE,  NO_POSITIVE_SAFE_EVIDENCE,  INCONCLUSIVE,  UNAVAILABLE,  };

  @BuiltValueField(wireName: r'explanation')
  String get explanation;

  @BuiltValueField(wireName: r'advisoryStatus')
  String get advisoryStatus;

  @BuiltValueField(wireName: r'limitations')
  BuiltList<String> get limitations;

  @BuiltValueField(wireName: r'versions')
  BuiltMap<String, String> get versions;

  @BuiltValueField(wireName: r'publicationEligible')
  bool get publicationEligible;

  @BuiltValueField(wireName: r'rewardsEligible')
  bool get rewardsEligible;

  @BuiltValueField(wireName: r'reviews')
  BuiltList<BetaReview>? get reviews;

  BetaCase._();

  factory BetaCase([void updates(BetaCaseBuilder b)]) = _$BetaCase;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(BetaCaseBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<BetaCase> get serializer => _$BetaCaseSerializer();
}

class _$BetaCaseSerializer implements PrimitiveSerializer<BetaCase> {
  @override
  final Iterable<Type> types = const [BetaCase, _$BetaCase];

  @override
  final String wireName = r'BetaCase';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    BetaCase object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    yield r'schemaVersion';
    yield serializers.serialize(
      object.schemaVersion,
      specifiedType: const FullType(String),
    );
    yield r'caseId';
    yield serializers.serialize(
      object.caseId,
      specifiedType: const FullType(String),
    );
    yield r'status';
    yield serializers.serialize(
      object.status,
      specifiedType: const FullType(BetaCaseStatusEnum),
    );
    yield r'createdAt';
    yield serializers.serialize(
      object.createdAt,
      specifiedType: const FullType(DateTime),
    );
    yield r'updatedAt';
    yield serializers.serialize(
      object.updatedAt,
      specifiedType: const FullType(DateTime),
    );
    yield r'expiresAt';
    yield serializers.serialize(
      object.expiresAt,
      specifiedType: const FullType(DateTime),
    );
    yield r'reviewState';
    yield serializers.serialize(
      object.reviewState,
      specifiedType: const FullType(BetaCaseReviewStateEnum),
    );
    yield r'finding';
    yield serializers.serialize(
      object.finding,
      specifiedType: const FullType(BetaCaseFindingEnum),
    );
    yield r'explanation';
    yield serializers.serialize(
      object.explanation,
      specifiedType: const FullType(String),
    );
    yield r'advisoryStatus';
    yield serializers.serialize(
      object.advisoryStatus,
      specifiedType: const FullType(String),
    );
    yield r'limitations';
    yield serializers.serialize(
      object.limitations,
      specifiedType: const FullType(BuiltList, [FullType(String)]),
    );
    yield r'versions';
    yield serializers.serialize(
      object.versions,
      specifiedType: const FullType(BuiltMap, [FullType(String), FullType(String)]),
    );
    yield r'publicationEligible';
    yield serializers.serialize(
      object.publicationEligible,
      specifiedType: const FullType(bool),
    );
    yield r'rewardsEligible';
    yield serializers.serialize(
      object.rewardsEligible,
      specifiedType: const FullType(bool),
    );
    if (object.reviews != null) {
      yield r'reviews';
      yield serializers.serialize(
        object.reviews,
        specifiedType: const FullType(BuiltList, [FullType(BetaReview)]),
      );
    }
  }

  @override
  Object serialize(
    Serializers serializers,
    BetaCase object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required BetaCaseBuilder result,
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
            specifiedType: const FullType(BetaCaseStatusEnum),
          ) as BetaCaseStatusEnum;
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
            specifiedType: const FullType(BetaCaseReviewStateEnum),
          ) as BetaCaseReviewStateEnum;
          result.reviewState = valueDes;
          break;
        case r'finding':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(BetaCaseFindingEnum),
          ) as BetaCaseFindingEnum;
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
        default:
          unhandled.add(key);
          unhandled.add(value);
          break;
      }
    }
  }

  @override
  BetaCase deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = BetaCaseBuilder();
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

class BetaCaseStatusEnum extends EnumClass {

  @BuiltValueEnumConst(wireName: r'uploading')
  static const BetaCaseStatusEnum uploading = _$betaCaseStatusEnum_uploading;
  @BuiltValueEnumConst(wireName: r'queued')
  static const BetaCaseStatusEnum queued = _$betaCaseStatusEnum_queued;
  @BuiltValueEnumConst(wireName: r'analyzing')
  static const BetaCaseStatusEnum analyzing = _$betaCaseStatusEnum_analyzing;
  @BuiltValueEnumConst(wireName: r'complete')
  static const BetaCaseStatusEnum complete = _$betaCaseStatusEnum_complete;
  @BuiltValueEnumConst(wireName: r'inconclusive')
  static const BetaCaseStatusEnum inconclusive = _$betaCaseStatusEnum_inconclusive;
  @BuiltValueEnumConst(wireName: r'unsupported')
  static const BetaCaseStatusEnum unsupported = _$betaCaseStatusEnum_unsupported;
  @BuiltValueEnumConst(wireName: r'failed')
  static const BetaCaseStatusEnum failed = _$betaCaseStatusEnum_failed;
  @BuiltValueEnumConst(wireName: r'paused')
  static const BetaCaseStatusEnum paused = _$betaCaseStatusEnum_paused;
  @BuiltValueEnumConst(wireName: r'safety_review')
  static const BetaCaseStatusEnum safetyReview = _$betaCaseStatusEnum_safetyReview;
  @BuiltValueEnumConst(wireName: r'safety_blocked')
  static const BetaCaseStatusEnum safetyBlocked = _$betaCaseStatusEnum_safetyBlocked;
  @BuiltValueEnumConst(wireName: r'cancelled')
  static const BetaCaseStatusEnum cancelled = _$betaCaseStatusEnum_cancelled;
  @BuiltValueEnumConst(wireName: r'expired')
  static const BetaCaseStatusEnum expired = _$betaCaseStatusEnum_expired;
  @BuiltValueEnumConst(wireName: r'deleted')
  static const BetaCaseStatusEnum deleted = _$betaCaseStatusEnum_deleted;

  static Serializer<BetaCaseStatusEnum> get serializer => _$betaCaseStatusEnumSerializer;

  const BetaCaseStatusEnum._(String name): super(name);

  static BuiltSet<BetaCaseStatusEnum> get values => _$betaCaseStatusEnumValues;
  static BetaCaseStatusEnum valueOf(String name) => _$betaCaseStatusEnumValueOf(name);
}

class BetaCaseReviewStateEnum extends EnumClass {

  @BuiltValueEnumConst(wireName: r'none')
  static const BetaCaseReviewStateEnum none = _$betaCaseReviewStateEnum_none;
  @BuiltValueEnumConst(wireName: r'requested')
  static const BetaCaseReviewStateEnum requested = _$betaCaseReviewStateEnum_requested;
  @BuiltValueEnumConst(wireName: r'reviewed')
  static const BetaCaseReviewStateEnum reviewed = _$betaCaseReviewStateEnum_reviewed;

  static Serializer<BetaCaseReviewStateEnum> get serializer => _$betaCaseReviewStateEnumSerializer;

  const BetaCaseReviewStateEnum._(String name): super(name);

  static BuiltSet<BetaCaseReviewStateEnum> get values => _$betaCaseReviewStateEnumValues;
  static BetaCaseReviewStateEnum valueOf(String name) => _$betaCaseReviewStateEnumValueOf(name);
}

class BetaCaseFindingEnum extends EnumClass {

  @BuiltValueEnumConst(wireName: r'SYNTHETIC_LIKE_EVIDENCE')
  static const BetaCaseFindingEnum SYNTHETIC_LIKE_EVIDENCE = _$betaCaseFindingEnum_SYNTHETIC_LIKE_EVIDENCE;
  @BuiltValueEnumConst(wireName: r'NO_POSITIVE_SAFE_EVIDENCE')
  static const BetaCaseFindingEnum NO_POSITIVE_SAFE_EVIDENCE = _$betaCaseFindingEnum_NO_POSITIVE_SAFE_EVIDENCE;
  @BuiltValueEnumConst(wireName: r'INCONCLUSIVE')
  static const BetaCaseFindingEnum INCONCLUSIVE = _$betaCaseFindingEnum_INCONCLUSIVE;
  @BuiltValueEnumConst(wireName: r'UNAVAILABLE')
  static const BetaCaseFindingEnum UNAVAILABLE = _$betaCaseFindingEnum_UNAVAILABLE;

  static Serializer<BetaCaseFindingEnum> get serializer => _$betaCaseFindingEnumSerializer;

  const BetaCaseFindingEnum._(String name): super(name);

  static BuiltSet<BetaCaseFindingEnum> get values => _$betaCaseFindingEnumValues;
  static BetaCaseFindingEnum valueOf(String name) => _$betaCaseFindingEnumValueOf(name);
}
