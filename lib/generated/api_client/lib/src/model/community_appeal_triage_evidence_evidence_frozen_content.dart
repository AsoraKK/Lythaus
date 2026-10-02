//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'community_appeal_triage_evidence_evidence_frozen_content.g.dart';

/// CommunityAppealTriageEvidenceEvidenceFrozenContent
///
/// Properties:
/// * [body]
/// * [declaration]
@BuiltValue()
abstract class CommunityAppealTriageEvidenceEvidenceFrozenContent implements Built<CommunityAppealTriageEvidenceEvidenceFrozenContent, CommunityAppealTriageEvidenceEvidenceFrozenContentBuilder> {
  @BuiltValueField(wireName: r'body')
  String get body;

  @BuiltValueField(wireName: r'declaration')
  String get declaration;

  CommunityAppealTriageEvidenceEvidenceFrozenContent._();

  factory CommunityAppealTriageEvidenceEvidenceFrozenContent([void updates(CommunityAppealTriageEvidenceEvidenceFrozenContentBuilder b)]) = _$CommunityAppealTriageEvidenceEvidenceFrozenContent;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(CommunityAppealTriageEvidenceEvidenceFrozenContentBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<CommunityAppealTriageEvidenceEvidenceFrozenContent> get serializer => _$CommunityAppealTriageEvidenceEvidenceFrozenContentSerializer();
}

class _$CommunityAppealTriageEvidenceEvidenceFrozenContentSerializer implements PrimitiveSerializer<CommunityAppealTriageEvidenceEvidenceFrozenContent> {
  @override
  final Iterable<Type> types = const [CommunityAppealTriageEvidenceEvidenceFrozenContent, _$CommunityAppealTriageEvidenceEvidenceFrozenContent];

  @override
  final String wireName = r'CommunityAppealTriageEvidenceEvidenceFrozenContent';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    CommunityAppealTriageEvidenceEvidenceFrozenContent object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    yield r'body';
    yield serializers.serialize(
      object.body,
      specifiedType: const FullType(String),
    );
    yield r'declaration';
    yield serializers.serialize(
      object.declaration,
      specifiedType: const FullType(String),
    );
  }

  @override
  Object serialize(
    Serializers serializers,
    CommunityAppealTriageEvidenceEvidenceFrozenContent object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required CommunityAppealTriageEvidenceEvidenceFrozenContentBuilder result,
    required List<Object?> unhandled,
  }) {
    for (var i = 0; i < serializedList.length; i += 2) {
      final key = serializedList[i] as String;
      final value = serializedList[i + 1];
      switch (key) {
        case r'body':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.body = valueDes;
          break;
        case r'declaration':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.declaration = valueDes;
          break;
        default:
          unhandled.add(key);
          unhandled.add(value);
          break;
      }
    }
  }

  @override
  CommunityAppealTriageEvidenceEvidenceFrozenContent deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = CommunityAppealTriageEvidenceEvidenceFrozenContentBuilder();
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
