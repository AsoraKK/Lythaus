//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:built_collection/built_collection.dart';
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'public_authorship.g.dart';

/// PublicAuthorship
///
/// Properties:
/// * [authorshipLabel]
/// * [declaredAuthorship]
/// * [classificationSource]
/// * [classificationState]
/// * [reviewState]
/// * [appealState]
/// * [labelVersion]
/// * [classifiedAt]
/// * [reviewedAt]
@BuiltValue()
abstract class PublicAuthorship implements Built<PublicAuthorship, PublicAuthorshipBuilder> {
  @BuiltValueField(wireName: r'authorshipLabel')
  PublicAuthorshipAuthorshipLabelEnum get authorshipLabel;
  // enum authorshipLabelEnum {  Human-authored,  AI-assisted,  Under review,  };

  @BuiltValueField(wireName: r'declaredAuthorship')
  PublicAuthorshipDeclaredAuthorshipEnum get declaredAuthorship;
  // enum declaredAuthorshipEnum {  human,  assisted,  };

  @BuiltValueField(wireName: r'classificationSource')
  PublicAuthorshipClassificationSourceEnum get classificationSource;
  // enum classificationSourceEnum {  user_disclosure,  automated_classification,  human_review,  appeal_outcome,  };

  @BuiltValueField(wireName: r'classificationState')
  PublicAuthorshipClassificationStateEnum get classificationState;
  // enum classificationStateEnum {  confirmed,  conflict,  unavailable,  };

  @BuiltValueField(wireName: r'reviewState')
  PublicAuthorshipReviewStateEnum get reviewState;
  // enum reviewStateEnum {  not_required,  pending,  in_review,  resolved,  };

  @BuiltValueField(wireName: r'appealState')
  PublicAuthorshipAppealStateEnum get appealState;
  // enum appealStateEnum {  none,  eligible,  pending,  resolved,  };

  @BuiltValueField(wireName: r'labelVersion')
  String get labelVersion;

  @BuiltValueField(wireName: r'classifiedAt')
  DateTime? get classifiedAt;

  @BuiltValueField(wireName: r'reviewedAt')
  DateTime? get reviewedAt;

  PublicAuthorship._();

  factory PublicAuthorship([void updates(PublicAuthorshipBuilder b)]) = _$PublicAuthorship;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(PublicAuthorshipBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<PublicAuthorship> get serializer => _$PublicAuthorshipSerializer();
}

class _$PublicAuthorshipSerializer implements PrimitiveSerializer<PublicAuthorship> {
  @override
  final Iterable<Type> types = const [PublicAuthorship, _$PublicAuthorship];

  @override
  final String wireName = r'PublicAuthorship';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    PublicAuthorship object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    yield r'authorshipLabel';
    yield serializers.serialize(
      object.authorshipLabel,
      specifiedType: const FullType(PublicAuthorshipAuthorshipLabelEnum),
    );
    yield r'declaredAuthorship';
    yield serializers.serialize(
      object.declaredAuthorship,
      specifiedType: const FullType(PublicAuthorshipDeclaredAuthorshipEnum),
    );
    yield r'classificationSource';
    yield serializers.serialize(
      object.classificationSource,
      specifiedType: const FullType(PublicAuthorshipClassificationSourceEnum),
    );
    yield r'classificationState';
    yield serializers.serialize(
      object.classificationState,
      specifiedType: const FullType(PublicAuthorshipClassificationStateEnum),
    );
    yield r'reviewState';
    yield serializers.serialize(
      object.reviewState,
      specifiedType: const FullType(PublicAuthorshipReviewStateEnum),
    );
    yield r'appealState';
    yield serializers.serialize(
      object.appealState,
      specifiedType: const FullType(PublicAuthorshipAppealStateEnum),
    );
    yield r'labelVersion';
    yield serializers.serialize(
      object.labelVersion,
      specifiedType: const FullType(String),
    );
    if (object.classifiedAt != null) {
      yield r'classifiedAt';
      yield serializers.serialize(
        object.classifiedAt,
        specifiedType: const FullType(DateTime),
      );
    }
    if (object.reviewedAt != null) {
      yield r'reviewedAt';
      yield serializers.serialize(
        object.reviewedAt,
        specifiedType: const FullType(DateTime),
      );
    }
  }

  @override
  Object serialize(
    Serializers serializers,
    PublicAuthorship object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required PublicAuthorshipBuilder result,
    required List<Object?> unhandled,
  }) {
    for (var i = 0; i < serializedList.length; i += 2) {
      final key = serializedList[i] as String;
      final value = serializedList[i + 1];
      switch (key) {
        case r'authorshipLabel':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(PublicAuthorshipAuthorshipLabelEnum),
          ) as PublicAuthorshipAuthorshipLabelEnum;
          result.authorshipLabel = valueDes;
          break;
        case r'declaredAuthorship':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(PublicAuthorshipDeclaredAuthorshipEnum),
          ) as PublicAuthorshipDeclaredAuthorshipEnum;
          result.declaredAuthorship = valueDes;
          break;
        case r'classificationSource':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(PublicAuthorshipClassificationSourceEnum),
          ) as PublicAuthorshipClassificationSourceEnum;
          result.classificationSource = valueDes;
          break;
        case r'classificationState':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(PublicAuthorshipClassificationStateEnum),
          ) as PublicAuthorshipClassificationStateEnum;
          result.classificationState = valueDes;
          break;
        case r'reviewState':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(PublicAuthorshipReviewStateEnum),
          ) as PublicAuthorshipReviewStateEnum;
          result.reviewState = valueDes;
          break;
        case r'appealState':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(PublicAuthorshipAppealStateEnum),
          ) as PublicAuthorshipAppealStateEnum;
          result.appealState = valueDes;
          break;
        case r'labelVersion':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.labelVersion = valueDes;
          break;
        case r'classifiedAt':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(DateTime),
          ) as DateTime;
          result.classifiedAt = valueDes;
          break;
        case r'reviewedAt':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(DateTime),
          ) as DateTime;
          result.reviewedAt = valueDes;
          break;
        default:
          unhandled.add(key);
          unhandled.add(value);
          break;
      }
    }
  }

  @override
  PublicAuthorship deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = PublicAuthorshipBuilder();
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

class PublicAuthorshipAuthorshipLabelEnum extends EnumClass {

  @BuiltValueEnumConst(wireName: r'Human-authored')
  static const PublicAuthorshipAuthorshipLabelEnum humanAuthored = _$publicAuthorshipAuthorshipLabelEnum_humanAuthored;
  @BuiltValueEnumConst(wireName: r'AI-assisted')
  static const PublicAuthorshipAuthorshipLabelEnum aIAssisted = _$publicAuthorshipAuthorshipLabelEnum_aIAssisted;
  @BuiltValueEnumConst(wireName: r'Under review')
  static const PublicAuthorshipAuthorshipLabelEnum underReview = _$publicAuthorshipAuthorshipLabelEnum_underReview;

  static Serializer<PublicAuthorshipAuthorshipLabelEnum> get serializer => _$publicAuthorshipAuthorshipLabelEnumSerializer;

  const PublicAuthorshipAuthorshipLabelEnum._(String name): super(name);

  static BuiltSet<PublicAuthorshipAuthorshipLabelEnum> get values => _$publicAuthorshipAuthorshipLabelEnumValues;
  static PublicAuthorshipAuthorshipLabelEnum valueOf(String name) => _$publicAuthorshipAuthorshipLabelEnumValueOf(name);
}

class PublicAuthorshipDeclaredAuthorshipEnum extends EnumClass {

  @BuiltValueEnumConst(wireName: r'human')
  static const PublicAuthorshipDeclaredAuthorshipEnum human = _$publicAuthorshipDeclaredAuthorshipEnum_human;
  @BuiltValueEnumConst(wireName: r'assisted')
  static const PublicAuthorshipDeclaredAuthorshipEnum assisted = _$publicAuthorshipDeclaredAuthorshipEnum_assisted;

  static Serializer<PublicAuthorshipDeclaredAuthorshipEnum> get serializer => _$publicAuthorshipDeclaredAuthorshipEnumSerializer;

  const PublicAuthorshipDeclaredAuthorshipEnum._(String name): super(name);

  static BuiltSet<PublicAuthorshipDeclaredAuthorshipEnum> get values => _$publicAuthorshipDeclaredAuthorshipEnumValues;
  static PublicAuthorshipDeclaredAuthorshipEnum valueOf(String name) => _$publicAuthorshipDeclaredAuthorshipEnumValueOf(name);
}

class PublicAuthorshipClassificationSourceEnum extends EnumClass {

  @BuiltValueEnumConst(wireName: r'user_disclosure')
  static const PublicAuthorshipClassificationSourceEnum userDisclosure = _$publicAuthorshipClassificationSourceEnum_userDisclosure;
  @BuiltValueEnumConst(wireName: r'automated_classification')
  static const PublicAuthorshipClassificationSourceEnum automatedClassification = _$publicAuthorshipClassificationSourceEnum_automatedClassification;
  @BuiltValueEnumConst(wireName: r'human_review')
  static const PublicAuthorshipClassificationSourceEnum humanReview = _$publicAuthorshipClassificationSourceEnum_humanReview;
  @BuiltValueEnumConst(wireName: r'appeal_outcome')
  static const PublicAuthorshipClassificationSourceEnum appealOutcome = _$publicAuthorshipClassificationSourceEnum_appealOutcome;

  static Serializer<PublicAuthorshipClassificationSourceEnum> get serializer => _$publicAuthorshipClassificationSourceEnumSerializer;

  const PublicAuthorshipClassificationSourceEnum._(String name): super(name);

  static BuiltSet<PublicAuthorshipClassificationSourceEnum> get values => _$publicAuthorshipClassificationSourceEnumValues;
  static PublicAuthorshipClassificationSourceEnum valueOf(String name) => _$publicAuthorshipClassificationSourceEnumValueOf(name);
}

class PublicAuthorshipClassificationStateEnum extends EnumClass {

  @BuiltValueEnumConst(wireName: r'confirmed')
  static const PublicAuthorshipClassificationStateEnum confirmed = _$publicAuthorshipClassificationStateEnum_confirmed;
  @BuiltValueEnumConst(wireName: r'conflict')
  static const PublicAuthorshipClassificationStateEnum conflict = _$publicAuthorshipClassificationStateEnum_conflict;
  @BuiltValueEnumConst(wireName: r'unavailable')
  static const PublicAuthorshipClassificationStateEnum unavailable = _$publicAuthorshipClassificationStateEnum_unavailable;

  static Serializer<PublicAuthorshipClassificationStateEnum> get serializer => _$publicAuthorshipClassificationStateEnumSerializer;

  const PublicAuthorshipClassificationStateEnum._(String name): super(name);

  static BuiltSet<PublicAuthorshipClassificationStateEnum> get values => _$publicAuthorshipClassificationStateEnumValues;
  static PublicAuthorshipClassificationStateEnum valueOf(String name) => _$publicAuthorshipClassificationStateEnumValueOf(name);
}

class PublicAuthorshipReviewStateEnum extends EnumClass {

  @BuiltValueEnumConst(wireName: r'not_required')
  static const PublicAuthorshipReviewStateEnum notRequired = _$publicAuthorshipReviewStateEnum_notRequired;
  @BuiltValueEnumConst(wireName: r'pending')
  static const PublicAuthorshipReviewStateEnum pending = _$publicAuthorshipReviewStateEnum_pending;
  @BuiltValueEnumConst(wireName: r'in_review')
  static const PublicAuthorshipReviewStateEnum inReview = _$publicAuthorshipReviewStateEnum_inReview;
  @BuiltValueEnumConst(wireName: r'resolved')
  static const PublicAuthorshipReviewStateEnum resolved = _$publicAuthorshipReviewStateEnum_resolved;

  static Serializer<PublicAuthorshipReviewStateEnum> get serializer => _$publicAuthorshipReviewStateEnumSerializer;

  const PublicAuthorshipReviewStateEnum._(String name): super(name);

  static BuiltSet<PublicAuthorshipReviewStateEnum> get values => _$publicAuthorshipReviewStateEnumValues;
  static PublicAuthorshipReviewStateEnum valueOf(String name) => _$publicAuthorshipReviewStateEnumValueOf(name);
}

class PublicAuthorshipAppealStateEnum extends EnumClass {

  @BuiltValueEnumConst(wireName: r'none')
  static const PublicAuthorshipAppealStateEnum none = _$publicAuthorshipAppealStateEnum_none;
  @BuiltValueEnumConst(wireName: r'eligible')
  static const PublicAuthorshipAppealStateEnum eligible = _$publicAuthorshipAppealStateEnum_eligible;
  @BuiltValueEnumConst(wireName: r'pending')
  static const PublicAuthorshipAppealStateEnum pending = _$publicAuthorshipAppealStateEnum_pending;
  @BuiltValueEnumConst(wireName: r'resolved')
  static const PublicAuthorshipAppealStateEnum resolved = _$publicAuthorshipAppealStateEnum_resolved;

  static Serializer<PublicAuthorshipAppealStateEnum> get serializer => _$publicAuthorshipAppealStateEnumSerializer;

  const PublicAuthorshipAppealStateEnum._(String name): super(name);

  static BuiltSet<PublicAuthorshipAppealStateEnum> get values => _$publicAuthorshipAppealStateEnumValues;
  static PublicAuthorshipAppealStateEnum valueOf(String name) => _$publicAuthorshipAppealStateEnumValueOf(name);
}
