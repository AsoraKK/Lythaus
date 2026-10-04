//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:built_collection/built_collection.dart';
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'community_appeal_triage_queue_items_inner.g.dart';

/// CommunityAppealTriageQueueItemsInner
///
/// Properties:
/// * [appealId]
/// * [state]
/// * [reviewClass]
/// * [rulesVersion]
@BuiltValue()
abstract class CommunityAppealTriageQueueItemsInner implements Built<CommunityAppealTriageQueueItemsInner, CommunityAppealTriageQueueItemsInnerBuilder> {
  @BuiltValueField(wireName: r'appealId')
  String get appealId;

  @BuiltValueField(wireName: r'state')
  CommunityAppealTriageQueueItemsInnerStateEnum get state;
  // enum stateEnum {  submitted,  restricted_review,  unresolved,  };

  @BuiltValueField(wireName: r'reviewClass')
  CommunityAppealTriageQueueItemsInnerReviewClassEnum get reviewClass;
  // enum reviewClassEnum {  untriaged,  standard,  restricted,  };

  @BuiltValueField(wireName: r'rulesVersion')
  String get rulesVersion;

  CommunityAppealTriageQueueItemsInner._();

  factory CommunityAppealTriageQueueItemsInner([void updates(CommunityAppealTriageQueueItemsInnerBuilder b)]) = _$CommunityAppealTriageQueueItemsInner;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(CommunityAppealTriageQueueItemsInnerBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<CommunityAppealTriageQueueItemsInner> get serializer => _$CommunityAppealTriageQueueItemsInnerSerializer();
}

class _$CommunityAppealTriageQueueItemsInnerSerializer implements PrimitiveSerializer<CommunityAppealTriageQueueItemsInner> {
  @override
  final Iterable<Type> types = const [CommunityAppealTriageQueueItemsInner, _$CommunityAppealTriageQueueItemsInner];

  @override
  final String wireName = r'CommunityAppealTriageQueueItemsInner';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    CommunityAppealTriageQueueItemsInner object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    yield r'appealId';
    yield serializers.serialize(
      object.appealId,
      specifiedType: const FullType(String),
    );
    yield r'state';
    yield serializers.serialize(
      object.state,
      specifiedType: const FullType(CommunityAppealTriageQueueItemsInnerStateEnum),
    );
    yield r'reviewClass';
    yield serializers.serialize(
      object.reviewClass,
      specifiedType: const FullType(CommunityAppealTriageQueueItemsInnerReviewClassEnum),
    );
    yield r'rulesVersion';
    yield serializers.serialize(
      object.rulesVersion,
      specifiedType: const FullType(String),
    );
  }

  @override
  Object serialize(
    Serializers serializers,
    CommunityAppealTriageQueueItemsInner object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required CommunityAppealTriageQueueItemsInnerBuilder result,
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
        case r'state':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(CommunityAppealTriageQueueItemsInnerStateEnum),
          ) as CommunityAppealTriageQueueItemsInnerStateEnum;
          result.state = valueDes;
          break;
        case r'reviewClass':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(CommunityAppealTriageQueueItemsInnerReviewClassEnum),
          ) as CommunityAppealTriageQueueItemsInnerReviewClassEnum;
          result.reviewClass = valueDes;
          break;
        case r'rulesVersion':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.rulesVersion = valueDes;
          break;
        default:
          unhandled.add(key);
          unhandled.add(value);
          break;
      }
    }
  }

  @override
  CommunityAppealTriageQueueItemsInner deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = CommunityAppealTriageQueueItemsInnerBuilder();
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

class CommunityAppealTriageQueueItemsInnerStateEnum extends EnumClass {

  @BuiltValueEnumConst(wireName: r'submitted')
  static const CommunityAppealTriageQueueItemsInnerStateEnum submitted = _$communityAppealTriageQueueItemsInnerStateEnum_submitted;
  @BuiltValueEnumConst(wireName: r'restricted_review')
  static const CommunityAppealTriageQueueItemsInnerStateEnum restrictedReview = _$communityAppealTriageQueueItemsInnerStateEnum_restrictedReview;
  @BuiltValueEnumConst(wireName: r'unresolved')
  static const CommunityAppealTriageQueueItemsInnerStateEnum unresolved = _$communityAppealTriageQueueItemsInnerStateEnum_unresolved;

  static Serializer<CommunityAppealTriageQueueItemsInnerStateEnum> get serializer => _$communityAppealTriageQueueItemsInnerStateEnumSerializer;

  const CommunityAppealTriageQueueItemsInnerStateEnum._(String name): super(name);

  static BuiltSet<CommunityAppealTriageQueueItemsInnerStateEnum> get values => _$communityAppealTriageQueueItemsInnerStateEnumValues;
  static CommunityAppealTriageQueueItemsInnerStateEnum valueOf(String name) => _$communityAppealTriageQueueItemsInnerStateEnumValueOf(name);
}

class CommunityAppealTriageQueueItemsInnerReviewClassEnum extends EnumClass {

  @BuiltValueEnumConst(wireName: r'untriaged')
  static const CommunityAppealTriageQueueItemsInnerReviewClassEnum untriaged = _$communityAppealTriageQueueItemsInnerReviewClassEnum_untriaged;
  @BuiltValueEnumConst(wireName: r'standard')
  static const CommunityAppealTriageQueueItemsInnerReviewClassEnum standard = _$communityAppealTriageQueueItemsInnerReviewClassEnum_standard;
  @BuiltValueEnumConst(wireName: r'restricted')
  static const CommunityAppealTriageQueueItemsInnerReviewClassEnum restricted = _$communityAppealTriageQueueItemsInnerReviewClassEnum_restricted;

  static Serializer<CommunityAppealTriageQueueItemsInnerReviewClassEnum> get serializer => _$communityAppealTriageQueueItemsInnerReviewClassEnumSerializer;

  const CommunityAppealTriageQueueItemsInnerReviewClassEnum._(String name): super(name);

  static BuiltSet<CommunityAppealTriageQueueItemsInnerReviewClassEnum> get values => _$communityAppealTriageQueueItemsInnerReviewClassEnumValues;
  static CommunityAppealTriageQueueItemsInnerReviewClassEnum valueOf(String name) => _$communityAppealTriageQueueItemsInnerReviewClassEnumValueOf(name);
}
