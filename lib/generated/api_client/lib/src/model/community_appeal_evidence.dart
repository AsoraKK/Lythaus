//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'community_appeal_evidence.g.dart';

/// CommunityAppealEvidence
///
/// Properties:
/// * [preview]
/// * [ruleContext]
/// * [version]
/// * [evidenceHash]
@BuiltValue()
abstract class CommunityAppealEvidence implements Built<CommunityAppealEvidence, CommunityAppealEvidenceBuilder> {
  @BuiltValueField(wireName: r'preview')
  String get preview;

  @BuiltValueField(wireName: r'ruleContext')
  String get ruleContext;

  @BuiltValueField(wireName: r'version')
  String get version;

  @BuiltValueField(wireName: r'evidenceHash')
  String get evidenceHash;

  CommunityAppealEvidence._();

  factory CommunityAppealEvidence([void updates(CommunityAppealEvidenceBuilder b)]) = _$CommunityAppealEvidence;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(CommunityAppealEvidenceBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<CommunityAppealEvidence> get serializer => _$CommunityAppealEvidenceSerializer();
}

class _$CommunityAppealEvidenceSerializer implements PrimitiveSerializer<CommunityAppealEvidence> {
  @override
  final Iterable<Type> types = const [CommunityAppealEvidence, _$CommunityAppealEvidence];

  @override
  final String wireName = r'CommunityAppealEvidence';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    CommunityAppealEvidence object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    yield r'preview';
    yield serializers.serialize(
      object.preview,
      specifiedType: const FullType(String),
    );
    yield r'ruleContext';
    yield serializers.serialize(
      object.ruleContext,
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
  }

  @override
  Object serialize(
    Serializers serializers,
    CommunityAppealEvidence object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required CommunityAppealEvidenceBuilder result,
    required List<Object?> unhandled,
  }) {
    for (var i = 0; i < serializedList.length; i += 2) {
      final key = serializedList[i] as String;
      final value = serializedList[i + 1];
      switch (key) {
        case r'preview':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.preview = valueDes;
          break;
        case r'ruleContext':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.ruleContext = valueDes;
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
        default:
          unhandled.add(key);
          unhandled.add(value);
          break;
      }
    }
  }

  @override
  CommunityAppealEvidence deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = CommunityAppealEvidenceBuilder();
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
