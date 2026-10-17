//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'moderation_case_revision.g.dart';

/// ModerationCaseRevision
///
/// Properties:
/// * [resolvedAt] - Opaque exact UTC revision component. Preserve all six fractional digits, including trailing zeroes.
/// * [sourceEventId]
/// * [decisionId]
@BuiltValue()
abstract class ModerationCaseRevision implements Built<ModerationCaseRevision, ModerationCaseRevisionBuilder> {
  /// Opaque exact UTC revision component. Preserve all six fractional digits, including trailing zeroes.
  @BuiltValueField(wireName: r'resolvedAt')
  String get resolvedAt;

  @BuiltValueField(wireName: r'sourceEventId')
  String get sourceEventId;

  @BuiltValueField(wireName: r'decisionId')
  String get decisionId;

  ModerationCaseRevision._();

  factory ModerationCaseRevision([void updates(ModerationCaseRevisionBuilder b)]) = _$ModerationCaseRevision;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(ModerationCaseRevisionBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<ModerationCaseRevision> get serializer => _$ModerationCaseRevisionSerializer();
}

class _$ModerationCaseRevisionSerializer implements PrimitiveSerializer<ModerationCaseRevision> {
  @override
  final Iterable<Type> types = const [ModerationCaseRevision, _$ModerationCaseRevision];

  @override
  final String wireName = r'ModerationCaseRevision';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    ModerationCaseRevision object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    yield r'resolvedAt';
    yield serializers.serialize(
      object.resolvedAt,
      specifiedType: const FullType(String),
    );
    yield r'sourceEventId';
    yield serializers.serialize(
      object.sourceEventId,
      specifiedType: const FullType(String),
    );
    yield r'decisionId';
    yield serializers.serialize(
      object.decisionId,
      specifiedType: const FullType(String),
    );
  }

  @override
  Object serialize(
    Serializers serializers,
    ModerationCaseRevision object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required ModerationCaseRevisionBuilder result,
    required List<Object?> unhandled,
  }) {
    for (var i = 0; i < serializedList.length; i += 2) {
      final key = serializedList[i] as String;
      final value = serializedList[i + 1];
      switch (key) {
        case r'resolvedAt':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.resolvedAt = valueDes;
          break;
        case r'sourceEventId':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.sourceEventId = valueDes;
          break;
        case r'decisionId':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.decisionId = valueDes;
          break;
        default:
          unhandled.add(key);
          unhandled.add(value);
          break;
      }
    }
  }

  @override
  ModerationCaseRevision deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = ModerationCaseRevisionBuilder();
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
