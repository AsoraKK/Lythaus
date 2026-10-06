//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:built_collection/built_collection.dart';
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'community_appeal_triage_request.g.dart';

/// Standard routing requires a safe text rendition and rule context. Restricted routing forbids peer evidence. Neither route can replace an already opened review packet.
///
/// Properties:
/// * [reviewClass]
/// * [safePreview]
/// * [ruleContext]
/// * [reasonCode]
@BuiltValue()
abstract class CommunityAppealTriageRequest implements Built<CommunityAppealTriageRequest, CommunityAppealTriageRequestBuilder> {
  @BuiltValueField(wireName: r'reviewClass')
  CommunityAppealTriageRequestReviewClassEnum get reviewClass;
  // enum reviewClassEnum {  standard,  restricted,  };

  @BuiltValueField(wireName: r'safePreview')
  String? get safePreview;

  @BuiltValueField(wireName: r'ruleContext')
  String? get ruleContext;

  @BuiltValueField(wireName: r'reasonCode')
  String get reasonCode;

  CommunityAppealTriageRequest._();

  factory CommunityAppealTriageRequest([void updates(CommunityAppealTriageRequestBuilder b)]) = _$CommunityAppealTriageRequest;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(CommunityAppealTriageRequestBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<CommunityAppealTriageRequest> get serializer => _$CommunityAppealTriageRequestSerializer();
}

class _$CommunityAppealTriageRequestSerializer implements PrimitiveSerializer<CommunityAppealTriageRequest> {
  @override
  final Iterable<Type> types = const [CommunityAppealTriageRequest, _$CommunityAppealTriageRequest];

  @override
  final String wireName = r'CommunityAppealTriageRequest';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    CommunityAppealTriageRequest object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    yield r'reviewClass';
    yield serializers.serialize(
      object.reviewClass,
      specifiedType: const FullType(CommunityAppealTriageRequestReviewClassEnum),
    );
    if (object.safePreview != null) {
      yield r'safePreview';
      yield serializers.serialize(
        object.safePreview,
        specifiedType: const FullType(String),
      );
    }
    if (object.ruleContext != null) {
      yield r'ruleContext';
      yield serializers.serialize(
        object.ruleContext,
        specifiedType: const FullType(String),
      );
    }
    yield r'reasonCode';
    yield serializers.serialize(
      object.reasonCode,
      specifiedType: const FullType(String),
    );
  }

  @override
  Object serialize(
    Serializers serializers,
    CommunityAppealTriageRequest object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required CommunityAppealTriageRequestBuilder result,
    required List<Object?> unhandled,
  }) {
    for (var i = 0; i < serializedList.length; i += 2) {
      final key = serializedList[i] as String;
      final value = serializedList[i + 1];
      switch (key) {
        case r'reviewClass':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(CommunityAppealTriageRequestReviewClassEnum),
          ) as CommunityAppealTriageRequestReviewClassEnum;
          result.reviewClass = valueDes;
          break;
        case r'safePreview':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.safePreview = valueDes;
          break;
        case r'ruleContext':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.ruleContext = valueDes;
          break;
        case r'reasonCode':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.reasonCode = valueDes;
          break;
        default:
          unhandled.add(key);
          unhandled.add(value);
          break;
      }
    }
  }

  @override
  CommunityAppealTriageRequest deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = CommunityAppealTriageRequestBuilder();
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

class CommunityAppealTriageRequestReviewClassEnum extends EnumClass {

  @BuiltValueEnumConst(wireName: r'standard')
  static const CommunityAppealTriageRequestReviewClassEnum standard = _$communityAppealTriageRequestReviewClassEnum_standard;
  @BuiltValueEnumConst(wireName: r'restricted')
  static const CommunityAppealTriageRequestReviewClassEnum restricted = _$communityAppealTriageRequestReviewClassEnum_restricted;

  static Serializer<CommunityAppealTriageRequestReviewClassEnum> get serializer => _$communityAppealTriageRequestReviewClassEnumSerializer;

  const CommunityAppealTriageRequestReviewClassEnum._(String name): super(name);

  static BuiltSet<CommunityAppealTriageRequestReviewClassEnum> get values => _$communityAppealTriageRequestReviewClassEnumValues;
  static CommunityAppealTriageRequestReviewClassEnum valueOf(String name) => _$communityAppealTriageRequestReviewClassEnumValueOf(name);
}
