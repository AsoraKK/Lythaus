//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:lythaus_api_client/src/model/alpha_case.dart';
import 'package:lythaus_api_client/src/model/alpha_component.dart';
import 'package:built_collection/built_collection.dart';
import 'package:lythaus_api_client/src/model/alpha_review.dart';
import 'package:built_value/json_object.dart';
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'alpha_admin_case.g.dart';

/// AlphaAdminCase
///
/// Properties:
/// * [diagnostics]
/// * [feedback]
/// * [schemaVersion]
/// * [caseId]
/// * [contentKind]
/// * [status]
/// * [createdAt]
/// * [updatedAt]
/// * [expiresAt]
/// * [reviewState]
/// * [finding]
/// * [interpretation]
/// * [explanation]
/// * [execution]
/// * [observer]
/// * [adviserStatus]
/// * [limitations]
/// * [versions]
/// * [hasText]
/// * [hasImage]
/// * [publicationEligible]
/// * [rewardsEligible]
/// * [reviews]
@BuiltValue()
abstract class AlphaAdminCase implements AlphaCase, Built<AlphaAdminCase, AlphaAdminCaseBuilder> {
  @BuiltValueField(wireName: r'feedback')
  BuiltList<AlphaReview>? get feedback;

  @BuiltValueField(wireName: r'diagnostics')
  BuiltMap<String, JsonObject?>? get diagnostics;

  AlphaAdminCase._();

  factory AlphaAdminCase([void updates(AlphaAdminCaseBuilder b)]) = _$AlphaAdminCase;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(AlphaAdminCaseBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<AlphaAdminCase> get serializer => _$AlphaAdminCaseSerializer();
}

class _$AlphaAdminCaseSerializer implements PrimitiveSerializer<AlphaAdminCase> {
  @override
  final Iterable<Type> types = const [AlphaAdminCase, _$AlphaAdminCase];

  @override
  final String wireName = r'AlphaAdminCase';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    AlphaAdminCase object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    yield r'execution';
    yield serializers.serialize(
      object.execution,
      specifiedType: const FullType(BuiltMap, [FullType(String), FullType(AlphaComponent)]),
    );
    yield r'schemaVersion';
    yield serializers.serialize(
      object.schemaVersion,
      specifiedType: const FullType(String),
    );
    yield r'contentKind';
    yield serializers.serialize(
      object.contentKind,
      specifiedType: const FullType(AlphaCaseContentKindEnum),
    );
    if (object.hasImage != null) {
      yield r'hasImage';
      yield serializers.serialize(
        object.hasImage,
        specifiedType: const FullType(bool),
      );
    }
    yield r'finding';
    yield serializers.serialize(
      object.finding,
      specifiedType: const FullType(AlphaCaseFindingEnum),
    );
    if (object.explanation != null) {
      yield r'explanation';
      yield serializers.serialize(
        object.explanation,
        specifiedType: const FullType(String),
      );
    }
    if (object.hasText != null) {
      yield r'hasText';
      yield serializers.serialize(
        object.hasText,
        specifiedType: const FullType(bool),
      );
    }
    if (object.expiresAt != null) {
      yield r'expiresAt';
      yield serializers.serialize(
        object.expiresAt,
        specifiedType: const FullType(DateTime),
      );
    }
    if (object.feedback != null) {
      yield r'feedback';
      yield serializers.serialize(
        object.feedback,
        specifiedType: const FullType(BuiltList, [FullType(AlphaReview)]),
      );
    }
    if (object.createdAt != null) {
      yield r'createdAt';
      yield serializers.serialize(
        object.createdAt,
        specifiedType: const FullType(DateTime),
      );
    }
    if (object.observer != null) {
      yield r'observer';
      yield serializers.serialize(
        object.observer,
        specifiedType: const FullType(BuiltMap, [FullType(String), FullType.nullable(JsonObject)]),
      );
    }
    if (object.diagnostics != null) {
      yield r'diagnostics';
      yield serializers.serialize(
        object.diagnostics,
        specifiedType: const FullType(BuiltMap, [FullType(String), FullType.nullable(JsonObject)]),
      );
    }
    if (object.reviews != null) {
      yield r'reviews';
      yield serializers.serialize(
        object.reviews,
        specifiedType: const FullType(BuiltList, [FullType(AlphaReview)]),
      );
    }
    yield r'interpretation';
    yield serializers.serialize(
      object.interpretation,
      specifiedType: const FullType(AlphaCaseInterpretationEnum),
    );
    if (object.versions != null) {
      yield r'versions';
      yield serializers.serialize(
        object.versions,
        specifiedType: const FullType(BuiltMap, [FullType(String), FullType.nullable(String)]),
      );
    }
    yield r'rewardsEligible';
    yield serializers.serialize(
      object.rewardsEligible,
      specifiedType: const FullType(bool),
    );
    yield r'caseId';
    yield serializers.serialize(
      object.caseId,
      specifiedType: const FullType(String),
    );
    yield r'publicationEligible';
    yield serializers.serialize(
      object.publicationEligible,
      specifiedType: const FullType(bool),
    );
    if (object.reviewState != null) {
      yield r'reviewState';
      yield serializers.serialize(
        object.reviewState,
        specifiedType: const FullType(String),
      );
    }
    if (object.adviserStatus != null) {
      yield r'adviserStatus';
      yield serializers.serialize(
        object.adviserStatus,
        specifiedType: const FullType(String),
      );
    }
    yield r'status';
    yield serializers.serialize(
      object.status,
      specifiedType: const FullType(String),
    );
    if (object.updatedAt != null) {
      yield r'updatedAt';
      yield serializers.serialize(
        object.updatedAt,
        specifiedType: const FullType(DateTime),
      );
    }
    if (object.limitations != null) {
      yield r'limitations';
      yield serializers.serialize(
        object.limitations,
        specifiedType: const FullType(BuiltList, [FullType(String)]),
      );
    }
  }

  @override
  Object serialize(
    Serializers serializers,
    AlphaAdminCase object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required AlphaAdminCaseBuilder result,
    required List<Object?> unhandled,
  }) {
    for (var i = 0; i < serializedList.length; i += 2) {
      final key = serializedList[i] as String;
      final value = serializedList[i + 1];
      switch (key) {
        case r'execution':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(BuiltMap, [FullType(String), FullType(AlphaComponent)]),
          ) as BuiltMap<String, AlphaComponent>;
          result.execution.replace(valueDes);
          break;
        case r'schemaVersion':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.schemaVersion = valueDes;
          break;
        case r'contentKind':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(AlphaCaseContentKindEnum),
          ) as AlphaCaseContentKindEnum;
          result.contentKind = valueDes;
          break;
        case r'hasImage':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(bool),
          ) as bool;
          result.hasImage = valueDes;
          break;
        case r'finding':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(AlphaCaseFindingEnum),
          ) as AlphaCaseFindingEnum;
          result.finding = valueDes;
          break;
        case r'explanation':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.explanation = valueDes;
          break;
        case r'hasText':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(bool),
          ) as bool;
          result.hasText = valueDes;
          break;
        case r'expiresAt':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(DateTime),
          ) as DateTime;
          result.expiresAt = valueDes;
          break;
        case r'feedback':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(BuiltList, [FullType(AlphaReview)]),
          ) as BuiltList<AlphaReview>;
          result.feedback.replace(valueDes);
          break;
        case r'createdAt':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(DateTime),
          ) as DateTime;
          result.createdAt = valueDes;
          break;
        case r'observer':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(BuiltMap, [FullType(String), FullType.nullable(JsonObject)]),
          ) as BuiltMap<String, JsonObject?>;
          result.observer.replace(valueDes);
          break;
        case r'diagnostics':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(BuiltMap, [FullType(String), FullType.nullable(JsonObject)]),
          ) as BuiltMap<String, JsonObject?>;
          result.diagnostics.replace(valueDes);
          break;
        case r'reviews':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(BuiltList, [FullType(AlphaReview)]),
          ) as BuiltList<AlphaReview>;
          result.reviews.replace(valueDes);
          break;
        case r'interpretation':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(AlphaCaseInterpretationEnum),
          ) as AlphaCaseInterpretationEnum;
          result.interpretation = valueDes;
          break;
        case r'versions':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(BuiltMap, [FullType(String), FullType.nullable(String)]),
          ) as BuiltMap<String, String?>;
          result.versions.replace(valueDes);
          break;
        case r'rewardsEligible':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(bool),
          ) as bool;
          result.rewardsEligible = valueDes;
          break;
        case r'caseId':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.caseId = valueDes;
          break;
        case r'publicationEligible':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(bool),
          ) as bool;
          result.publicationEligible = valueDes;
          break;
        case r'reviewState':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.reviewState = valueDes;
          break;
        case r'adviserStatus':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.adviserStatus = valueDes;
          break;
        case r'status':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.status = valueDes;
          break;
        case r'updatedAt':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(DateTime),
          ) as DateTime;
          result.updatedAt = valueDes;
          break;
        case r'limitations':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(BuiltList, [FullType(String)]),
          ) as BuiltList<String>;
          result.limitations.replace(valueDes);
          break;
        default:
          unhandled.add(key);
          unhandled.add(value);
          break;
      }
    }
  }

  @override
  AlphaAdminCase deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = AlphaAdminCaseBuilder();
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

class AlphaAdminCaseContentKindEnum extends EnumClass {

  @BuiltValueEnumConst(wireName: r'text')
  static const AlphaAdminCaseContentKindEnum text = _$alphaAdminCaseContentKindEnum_text;
  @BuiltValueEnumConst(wireName: r'image')
  static const AlphaAdminCaseContentKindEnum image = _$alphaAdminCaseContentKindEnum_image;
  @BuiltValueEnumConst(wireName: r'text_image')
  static const AlphaAdminCaseContentKindEnum textImage = _$alphaAdminCaseContentKindEnum_textImage;

  static Serializer<AlphaAdminCaseContentKindEnum> get serializer => _$alphaAdminCaseContentKindEnumSerializer;

  const AlphaAdminCaseContentKindEnum._(String name): super(name);

  static BuiltSet<AlphaAdminCaseContentKindEnum> get values => _$alphaAdminCaseContentKindEnumValues;
  static AlphaAdminCaseContentKindEnum valueOf(String name) => _$alphaAdminCaseContentKindEnumValueOf(name);
}

class AlphaAdminCaseFindingEnum extends EnumClass {

  @BuiltValueEnumConst(wireName: r'SYNTHETIC_LIKE_EVIDENCE')
  static const AlphaAdminCaseFindingEnum SYNTHETIC_LIKE_EVIDENCE = _$alphaAdminCaseFindingEnum_SYNTHETIC_LIKE_EVIDENCE;
  @BuiltValueEnumConst(wireName: r'NO_POSITIVE_SAFE_EVIDENCE')
  static const AlphaAdminCaseFindingEnum NO_POSITIVE_SAFE_EVIDENCE = _$alphaAdminCaseFindingEnum_NO_POSITIVE_SAFE_EVIDENCE;
  @BuiltValueEnumConst(wireName: r'INCONCLUSIVE')
  static const AlphaAdminCaseFindingEnum INCONCLUSIVE = _$alphaAdminCaseFindingEnum_INCONCLUSIVE;
  @BuiltValueEnumConst(wireName: r'UNAVAILABLE')
  static const AlphaAdminCaseFindingEnum UNAVAILABLE = _$alphaAdminCaseFindingEnum_UNAVAILABLE;

  static Serializer<AlphaAdminCaseFindingEnum> get serializer => _$alphaAdminCaseFindingEnumSerializer;

  const AlphaAdminCaseFindingEnum._(String name): super(name);

  static BuiltSet<AlphaAdminCaseFindingEnum> get values => _$alphaAdminCaseFindingEnumValues;
  static AlphaAdminCaseFindingEnum valueOf(String name) => _$alphaAdminCaseFindingEnumValueOf(name);
}

class AlphaAdminCaseInterpretationEnum extends EnumClass {

  @BuiltValueEnumConst(wireName: r'not_requested')
  static const AlphaAdminCaseInterpretationEnum notRequested = _$alphaAdminCaseInterpretationEnum_notRequested;
  @BuiltValueEnumConst(wireName: r'available')
  static const AlphaAdminCaseInterpretationEnum available = _$alphaAdminCaseInterpretationEnum_available;
  @BuiltValueEnumConst(wireName: r'inconclusive')
  static const AlphaAdminCaseInterpretationEnum inconclusive = _$alphaAdminCaseInterpretationEnum_inconclusive;
  @BuiltValueEnumConst(wireName: r'unavailable')
  static const AlphaAdminCaseInterpretationEnum unavailable = _$alphaAdminCaseInterpretationEnum_unavailable;

  static Serializer<AlphaAdminCaseInterpretationEnum> get serializer => _$alphaAdminCaseInterpretationEnumSerializer;

  const AlphaAdminCaseInterpretationEnum._(String name): super(name);

  static BuiltSet<AlphaAdminCaseInterpretationEnum> get values => _$alphaAdminCaseInterpretationEnumValues;
  static AlphaAdminCaseInterpretationEnum valueOf(String name) => _$alphaAdminCaseInterpretationEnumValueOf(name);
}
