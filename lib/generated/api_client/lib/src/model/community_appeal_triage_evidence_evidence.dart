//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:built_collection/built_collection.dart';
import 'package:lythaus_api_client/src/model/community_appeal_triage_evidence_evidence_frozen_content.dart';
import 'package:built_value/json_object.dart';
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'community_appeal_triage_evidence_evidence.g.dart';

/// CommunityAppealTriageEvidenceEvidence
///
/// Properties:
/// * [frozenContent]
/// * [classifierEvidence]
@BuiltValue()
abstract class CommunityAppealTriageEvidenceEvidence implements Built<CommunityAppealTriageEvidenceEvidence, CommunityAppealTriageEvidenceEvidenceBuilder> {
  @BuiltValueField(wireName: r'frozen_content')
  CommunityAppealTriageEvidenceEvidenceFrozenContent get frozenContent;

  @BuiltValueField(wireName: r'classifier_evidence')
  BuiltList<BuiltMap<String, JsonObject?>> get classifierEvidence;

  CommunityAppealTriageEvidenceEvidence._();

  factory CommunityAppealTriageEvidenceEvidence([void updates(CommunityAppealTriageEvidenceEvidenceBuilder b)]) = _$CommunityAppealTriageEvidenceEvidence;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(CommunityAppealTriageEvidenceEvidenceBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<CommunityAppealTriageEvidenceEvidence> get serializer => _$CommunityAppealTriageEvidenceEvidenceSerializer();
}

class _$CommunityAppealTriageEvidenceEvidenceSerializer implements PrimitiveSerializer<CommunityAppealTriageEvidenceEvidence> {
  @override
  final Iterable<Type> types = const [CommunityAppealTriageEvidenceEvidence, _$CommunityAppealTriageEvidenceEvidence];

  @override
  final String wireName = r'CommunityAppealTriageEvidenceEvidence';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    CommunityAppealTriageEvidenceEvidence object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    yield r'frozen_content';
    yield serializers.serialize(
      object.frozenContent,
      specifiedType: const FullType(CommunityAppealTriageEvidenceEvidenceFrozenContent),
    );
    yield r'classifier_evidence';
    yield serializers.serialize(
      object.classifierEvidence,
      specifiedType: const FullType(BuiltList, [FullType(BuiltMap, [FullType(String), FullType.nullable(JsonObject)])]),
    );
  }

  @override
  Object serialize(
    Serializers serializers,
    CommunityAppealTriageEvidenceEvidence object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required CommunityAppealTriageEvidenceEvidenceBuilder result,
    required List<Object?> unhandled,
  }) {
    for (var i = 0; i < serializedList.length; i += 2) {
      final key = serializedList[i] as String;
      final value = serializedList[i + 1];
      switch (key) {
        case r'frozen_content':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(CommunityAppealTriageEvidenceEvidenceFrozenContent),
          ) as CommunityAppealTriageEvidenceEvidenceFrozenContent;
          result.frozenContent.replace(valueDes);
          break;
        case r'classifier_evidence':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(BuiltList, [FullType(BuiltMap, [FullType(String), FullType.nullable(JsonObject)])]),
          ) as BuiltList<BuiltMap<String, JsonObject?>>;
          result.classifierEvidence.replace(valueDes);
          break;
        default:
          unhandled.add(key);
          unhandled.add(value);
          break;
      }
    }
  }

  @override
  CommunityAppealTriageEvidenceEvidence deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = CommunityAppealTriageEvidenceEvidenceBuilder();
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
