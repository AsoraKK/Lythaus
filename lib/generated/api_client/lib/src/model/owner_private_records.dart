//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:built_collection/built_collection.dart';
import 'package:lythaus_api_client/src/model/private_evidence.dart';
import 'package:lythaus_api_client/src/model/private_decision.dart';
import 'package:lythaus_api_client/src/model/private_note.dart';
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'owner_private_records.g.dart';

/// OwnerPrivateRecords
///
/// Properties:
/// * [notes]
/// * [nextNoteCursor]
/// * [evidence]
/// * [nextEvidenceCursor]
/// * [decisions]
/// * [nextDecisionCursor]
@BuiltValue()
abstract class OwnerPrivateRecords implements Built<OwnerPrivateRecords, OwnerPrivateRecordsBuilder> {
  @BuiltValueField(wireName: r'notes')
  BuiltList<PrivateNote> get notes;

  @BuiltValueField(wireName: r'nextNoteCursor')
  int? get nextNoteCursor;

  @BuiltValueField(wireName: r'evidence')
  BuiltList<PrivateEvidence> get evidence;

  @BuiltValueField(wireName: r'nextEvidenceCursor')
  int? get nextEvidenceCursor;

  @BuiltValueField(wireName: r'decisions')
  BuiltList<PrivateDecision> get decisions;

  @BuiltValueField(wireName: r'nextDecisionCursor')
  int? get nextDecisionCursor;

  OwnerPrivateRecords._();

  factory OwnerPrivateRecords([void updates(OwnerPrivateRecordsBuilder b)]) = _$OwnerPrivateRecords;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(OwnerPrivateRecordsBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<OwnerPrivateRecords> get serializer => _$OwnerPrivateRecordsSerializer();
}

class _$OwnerPrivateRecordsSerializer implements PrimitiveSerializer<OwnerPrivateRecords> {
  @override
  final Iterable<Type> types = const [OwnerPrivateRecords, _$OwnerPrivateRecords];

  @override
  final String wireName = r'OwnerPrivateRecords';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    OwnerPrivateRecords object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    yield r'notes';
    yield serializers.serialize(
      object.notes,
      specifiedType: const FullType(BuiltList, [FullType(PrivateNote)]),
    );
    yield r'nextNoteCursor';
    yield object.nextNoteCursor == null ? null : serializers.serialize(
      object.nextNoteCursor,
      specifiedType: const FullType.nullable(int),
    );
    yield r'evidence';
    yield serializers.serialize(
      object.evidence,
      specifiedType: const FullType(BuiltList, [FullType(PrivateEvidence)]),
    );
    yield r'nextEvidenceCursor';
    yield object.nextEvidenceCursor == null ? null : serializers.serialize(
      object.nextEvidenceCursor,
      specifiedType: const FullType.nullable(int),
    );
    yield r'decisions';
    yield serializers.serialize(
      object.decisions,
      specifiedType: const FullType(BuiltList, [FullType(PrivateDecision)]),
    );
    yield r'nextDecisionCursor';
    yield object.nextDecisionCursor == null ? null : serializers.serialize(
      object.nextDecisionCursor,
      specifiedType: const FullType.nullable(int),
    );
  }

  @override
  Object serialize(
    Serializers serializers,
    OwnerPrivateRecords object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required OwnerPrivateRecordsBuilder result,
    required List<Object?> unhandled,
  }) {
    for (var i = 0; i < serializedList.length; i += 2) {
      final key = serializedList[i] as String;
      final value = serializedList[i + 1];
      switch (key) {
        case r'notes':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(BuiltList, [FullType(PrivateNote)]),
          ) as BuiltList<PrivateNote>;
          result.notes.replace(valueDes);
          break;
        case r'nextNoteCursor':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType.nullable(int),
          ) as int?;
          if (valueDes == null) continue;
          result.nextNoteCursor = valueDes;
          break;
        case r'evidence':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(BuiltList, [FullType(PrivateEvidence)]),
          ) as BuiltList<PrivateEvidence>;
          result.evidence.replace(valueDes);
          break;
        case r'nextEvidenceCursor':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType.nullable(int),
          ) as int?;
          if (valueDes == null) continue;
          result.nextEvidenceCursor = valueDes;
          break;
        case r'decisions':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(BuiltList, [FullType(PrivateDecision)]),
          ) as BuiltList<PrivateDecision>;
          result.decisions.replace(valueDes);
          break;
        case r'nextDecisionCursor':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType.nullable(int),
          ) as int?;
          if (valueDes == null) continue;
          result.nextDecisionCursor = valueDes;
          break;
        default:
          unhandled.add(key);
          unhandled.add(value);
          break;
      }
    }
  }

  @override
  OwnerPrivateRecords deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = OwnerPrivateRecordsBuilder();
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
