//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:lythaus_api_client/src/model/alpha_component.dart';
import 'package:built_collection/built_collection.dart';
import 'package:lythaus_api_client/src/model/alpha_review.dart';
import 'package:built_value/json_object.dart';
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'alpha_case.g.dart';

/// AlphaCase
///
/// Properties:
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
@BuiltValue(instantiable: false)
abstract class AlphaCase  {
  @BuiltValueField(wireName: r'schemaVersion')
  String get schemaVersion;

  @BuiltValueField(wireName: r'caseId')
  String get caseId;

  @BuiltValueField(wireName: r'contentKind')
  AlphaCaseContentKindEnum get contentKind;
  // enum contentKindEnum {  text,  image,  text_image,  };

  @BuiltValueField(wireName: r'status')
  String get status;

  @BuiltValueField(wireName: r'createdAt')
  DateTime? get createdAt;

  @BuiltValueField(wireName: r'updatedAt')
  DateTime? get updatedAt;

  @BuiltValueField(wireName: r'expiresAt')
  DateTime? get expiresAt;

  @BuiltValueField(wireName: r'reviewState')
  String? get reviewState;

  @BuiltValueField(wireName: r'finding')
  AlphaCaseFindingEnum get finding;
  // enum findingEnum {  SYNTHETIC_LIKE_EVIDENCE,  NO_POSITIVE_SAFE_EVIDENCE,  INCONCLUSIVE,  UNAVAILABLE,  };

  @BuiltValueField(wireName: r'interpretation')
  AlphaCaseInterpretationEnum get interpretation;
  // enum interpretationEnum {  not_requested,  available,  inconclusive,  unavailable,  };

  @BuiltValueField(wireName: r'explanation')
  String? get explanation;

  @BuiltValueField(wireName: r'execution')
  BuiltMap<String, AlphaComponent> get execution;

  @BuiltValueField(wireName: r'observer')
  BuiltMap<String, JsonObject?>? get observer;

  @BuiltValueField(wireName: r'adviserStatus')
  String? get adviserStatus;

  @BuiltValueField(wireName: r'limitations')
  BuiltList<String>? get limitations;

  @BuiltValueField(wireName: r'versions')
  BuiltMap<String, String?>? get versions;

  @BuiltValueField(wireName: r'hasText')
  bool? get hasText;

  @BuiltValueField(wireName: r'hasImage')
  bool? get hasImage;

  @BuiltValueField(wireName: r'publicationEligible')
  bool get publicationEligible;

  @BuiltValueField(wireName: r'rewardsEligible')
  bool get rewardsEligible;

  @BuiltValueField(wireName: r'reviews')
  BuiltList<AlphaReview>? get reviews;

  @BuiltValueSerializer(custom: true)
  static Serializer<AlphaCase> get serializer => _$AlphaCaseSerializer();
}

class _$AlphaCaseSerializer implements PrimitiveSerializer<AlphaCase> {
  @override
  final Iterable<Type> types = const [AlphaCase];

  @override
  final String wireName = r'AlphaCase';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    AlphaCase object, {
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
    yield r'contentKind';
    yield serializers.serialize(
      object.contentKind,
      specifiedType: const FullType(AlphaCaseContentKindEnum),
    );
    yield r'status';
    yield serializers.serialize(
      object.status,
      specifiedType: const FullType(String),
    );
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
        specifiedType: const FullType(String),
      );
    }
    yield r'finding';
    yield serializers.serialize(
      object.finding,
      specifiedType: const FullType(AlphaCaseFindingEnum),
    );
    yield r'interpretation';
    yield serializers.serialize(
      object.interpretation,
      specifiedType: const FullType(AlphaCaseInterpretationEnum),
    );
    if (object.explanation != null) {
      yield r'explanation';
      yield serializers.serialize(
        object.explanation,
        specifiedType: const FullType(String),
      );
    }
    yield r'execution';
    yield serializers.serialize(
      object.execution,
      specifiedType: const FullType(BuiltMap, [FullType(String), FullType(AlphaComponent)]),
    );
    if (object.observer != null) {
      yield r'observer';
      yield serializers.serialize(
        object.observer,
        specifiedType: const FullType(BuiltMap, [FullType(String), FullType.nullable(JsonObject)]),
      );
    }
    if (object.adviserStatus != null) {
      yield r'adviserStatus';
      yield serializers.serialize(
        object.adviserStatus,
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
        specifiedType: const FullType(BuiltMap, [FullType(String), FullType.nullable(String)]),
      );
    }
    if (object.hasText != null) {
      yield r'hasText';
      yield serializers.serialize(
        object.hasText,
        specifiedType: const FullType(bool),
      );
    }
    if (object.hasImage != null) {
      yield r'hasImage';
      yield serializers.serialize(
        object.hasImage,
        specifiedType: const FullType(bool),
      );
    }
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
        specifiedType: const FullType(BuiltList, [FullType(AlphaReview)]),
      );
    }
  }

  @override
  Object serialize(
    Serializers serializers,
    AlphaCase object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  @override
  AlphaCase deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return serializers.deserialize(serialized, specifiedType: FullType($AlphaCase)) as $AlphaCase;
  }
}

/// a concrete implementation of [AlphaCase], since [AlphaCase] is not instantiable
@BuiltValue(instantiable: true)
abstract class $AlphaCase implements AlphaCase, Built<$AlphaCase, $AlphaCaseBuilder> {
  $AlphaCase._();

  factory $AlphaCase([void Function($AlphaCaseBuilder)? updates]) = _$$AlphaCase;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults($AlphaCaseBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<$AlphaCase> get serializer => _$$AlphaCaseSerializer();
}

class _$$AlphaCaseSerializer implements PrimitiveSerializer<$AlphaCase> {
  @override
  final Iterable<Type> types = const [$AlphaCase, _$$AlphaCase];

  @override
  final String wireName = r'$AlphaCase';

  @override
  Object serialize(
    Serializers serializers,
    $AlphaCase object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return serializers.serialize(object, specifiedType: FullType(AlphaCase))!;
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required AlphaCaseBuilder result,
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
        case r'contentKind':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(AlphaCaseContentKindEnum),
          ) as AlphaCaseContentKindEnum;
          result.contentKind = valueDes;
          break;
        case r'status':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
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
            specifiedType: const FullType(String),
          ) as String;
          result.reviewState = valueDes;
          break;
        case r'finding':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(AlphaCaseFindingEnum),
          ) as AlphaCaseFindingEnum;
          result.finding = valueDes;
          break;
        case r'interpretation':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(AlphaCaseInterpretationEnum),
          ) as AlphaCaseInterpretationEnum;
          result.interpretation = valueDes;
          break;
        case r'explanation':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.explanation = valueDes;
          break;
        case r'execution':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(BuiltMap, [FullType(String), FullType(AlphaComponent)]),
          ) as BuiltMap<String, AlphaComponent>;
          result.execution.replace(valueDes);
          break;
        case r'observer':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(BuiltMap, [FullType(String), FullType.nullable(JsonObject)]),
          ) as BuiltMap<String, JsonObject?>;
          result.observer.replace(valueDes);
          break;
        case r'adviserStatus':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.adviserStatus = valueDes;
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
            specifiedType: const FullType(BuiltMap, [FullType(String), FullType.nullable(String)]),
          ) as BuiltMap<String, String?>;
          result.versions.replace(valueDes);
          break;
        case r'hasText':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(bool),
          ) as bool;
          result.hasText = valueDes;
          break;
        case r'hasImage':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(bool),
          ) as bool;
          result.hasImage = valueDes;
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
            specifiedType: const FullType(BuiltList, [FullType(AlphaReview)]),
          ) as BuiltList<AlphaReview>;
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
  $AlphaCase deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = $AlphaCaseBuilder();
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

class AlphaCaseContentKindEnum extends EnumClass {

  @BuiltValueEnumConst(wireName: r'text')
  static const AlphaCaseContentKindEnum text = _$alphaCaseContentKindEnum_text;
  @BuiltValueEnumConst(wireName: r'image')
  static const AlphaCaseContentKindEnum image = _$alphaCaseContentKindEnum_image;
  @BuiltValueEnumConst(wireName: r'text_image')
  static const AlphaCaseContentKindEnum textImage = _$alphaCaseContentKindEnum_textImage;

  static Serializer<AlphaCaseContentKindEnum> get serializer => _$alphaCaseContentKindEnumSerializer;

  const AlphaCaseContentKindEnum._(String name): super(name);

  static BuiltSet<AlphaCaseContentKindEnum> get values => _$alphaCaseContentKindEnumValues;
  static AlphaCaseContentKindEnum valueOf(String name) => _$alphaCaseContentKindEnumValueOf(name);
}

class AlphaCaseFindingEnum extends EnumClass {

  @BuiltValueEnumConst(wireName: r'SYNTHETIC_LIKE_EVIDENCE')
  static const AlphaCaseFindingEnum SYNTHETIC_LIKE_EVIDENCE = _$alphaCaseFindingEnum_SYNTHETIC_LIKE_EVIDENCE;
  @BuiltValueEnumConst(wireName: r'NO_POSITIVE_SAFE_EVIDENCE')
  static const AlphaCaseFindingEnum NO_POSITIVE_SAFE_EVIDENCE = _$alphaCaseFindingEnum_NO_POSITIVE_SAFE_EVIDENCE;
  @BuiltValueEnumConst(wireName: r'INCONCLUSIVE')
  static const AlphaCaseFindingEnum INCONCLUSIVE = _$alphaCaseFindingEnum_INCONCLUSIVE;
  @BuiltValueEnumConst(wireName: r'UNAVAILABLE')
  static const AlphaCaseFindingEnum UNAVAILABLE = _$alphaCaseFindingEnum_UNAVAILABLE;

  static Serializer<AlphaCaseFindingEnum> get serializer => _$alphaCaseFindingEnumSerializer;

  const AlphaCaseFindingEnum._(String name): super(name);

  static BuiltSet<AlphaCaseFindingEnum> get values => _$alphaCaseFindingEnumValues;
  static AlphaCaseFindingEnum valueOf(String name) => _$alphaCaseFindingEnumValueOf(name);
}

class AlphaCaseInterpretationEnum extends EnumClass {

  @BuiltValueEnumConst(wireName: r'not_requested')
  static const AlphaCaseInterpretationEnum notRequested = _$alphaCaseInterpretationEnum_notRequested;
  @BuiltValueEnumConst(wireName: r'available')
  static const AlphaCaseInterpretationEnum available = _$alphaCaseInterpretationEnum_available;
  @BuiltValueEnumConst(wireName: r'inconclusive')
  static const AlphaCaseInterpretationEnum inconclusive = _$alphaCaseInterpretationEnum_inconclusive;
  @BuiltValueEnumConst(wireName: r'unavailable')
  static const AlphaCaseInterpretationEnum unavailable = _$alphaCaseInterpretationEnum_unavailable;

  static Serializer<AlphaCaseInterpretationEnum> get serializer => _$alphaCaseInterpretationEnumSerializer;

  const AlphaCaseInterpretationEnum._(String name): super(name);

  static BuiltSet<AlphaCaseInterpretationEnum> get values => _$alphaCaseInterpretationEnumValues;
  static AlphaCaseInterpretationEnum valueOf(String name) => _$alphaCaseInterpretationEnumValueOf(name);
}
