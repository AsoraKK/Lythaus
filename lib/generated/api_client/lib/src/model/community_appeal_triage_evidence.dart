//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:lythaus_api_client/src/model/community_appeal_triage_evidence_evidence.dart';
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'community_appeal_triage_evidence.g.dart';

/// CommunityAppealTriageEvidence
///
/// Properties:
/// * [appealId]
/// * [state]
/// * [challengedDecisionId]
/// * [version]
/// * [evidenceHash]
/// * [evidence]
@BuiltValue()
abstract class CommunityAppealTriageEvidence implements Built<CommunityAppealTriageEvidence, CommunityAppealTriageEvidenceBuilder> {
  @BuiltValueField(wireName: r'appealId')
  String get appealId;

  @BuiltValueField(wireName: r'state')
  String get state;

  @BuiltValueField(wireName: r'challengedDecisionId')
  String get challengedDecisionId;

  @BuiltValueField(wireName: r'version')
  String get version;

  @BuiltValueField(wireName: r'evidenceHash')
  String get evidenceHash;

  @BuiltValueField(wireName: r'evidence')
  CommunityAppealTriageEvidenceEvidence get evidence;

  CommunityAppealTriageEvidence._();

  factory CommunityAppealTriageEvidence([void updates(CommunityAppealTriageEvidenceBuilder b)]) = _$CommunityAppealTriageEvidence;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(CommunityAppealTriageEvidenceBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<CommunityAppealTriageEvidence> get serializer => _$CommunityAppealTriageEvidenceSerializer();
}

class _$CommunityAppealTriageEvidenceSerializer implements PrimitiveSerializer<CommunityAppealTriageEvidence> {
  @override
  final Iterable<Type> types = const [CommunityAppealTriageEvidence, _$CommunityAppealTriageEvidence];

  @override
  final String wireName = r'CommunityAppealTriageEvidence';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    CommunityAppealTriageEvidence object, {
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
      specifiedType: const FullType(String),
    );
    yield r'challengedDecisionId';
    yield serializers.serialize(
      object.challengedDecisionId,
      specifiedType: const FullType(String),
    );
    yield r'version';
    yield serializers.serialize(
      object.version,
      specifiedType: const FullType(String),
    );
    yield r'evidenceHash';
    yield serializers.serialize(
      object.evidenceHash,
      specifiedType: const FullType(String),
    );
    yield r'evidence';
    yield serializers.serialize(
      object.evidence,
      specifiedType: const FullType(CommunityAppealTriageEvidenceEvidence),
    );
  }

  @override
  Object serialize(
    Serializers serializers,
    CommunityAppealTriageEvidence object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required CommunityAppealTriageEvidenceBuilder result,
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
            specifiedType: const FullType(String),
          ) as String;
          result.state = valueDes;
          break;
        case r'challengedDecisionId':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.challengedDecisionId = valueDes;
          break;
        case r'version':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.version = valueDes;
          break;
        case r'evidenceHash':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.evidenceHash = valueDes;
          break;
        case r'evidence':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(CommunityAppealTriageEvidenceEvidence),
          ) as CommunityAppealTriageEvidenceEvidence;
          result.evidence.replace(valueDes);
          break;
        default:
          unhandled.add(key);
          unhandled.add(value);
          break;
      }
    }
  }

  @override
  CommunityAppealTriageEvidence deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = CommunityAppealTriageEvidenceBuilder();
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
