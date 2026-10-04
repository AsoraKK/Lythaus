//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'owner_note_request.g.dart';

/// OwnerNoteRequest
///
/// Properties:
/// * [expectedRevision]
/// * [text]
@BuiltValue()
abstract class OwnerNoteRequest implements Built<OwnerNoteRequest, OwnerNoteRequestBuilder> {
  @BuiltValueField(wireName: r'expectedRevision')
  int get expectedRevision;

  @BuiltValueField(wireName: r'text')
  String get text;

  OwnerNoteRequest._();

  factory OwnerNoteRequest([void updates(OwnerNoteRequestBuilder b)]) = _$OwnerNoteRequest;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(OwnerNoteRequestBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<OwnerNoteRequest> get serializer => _$OwnerNoteRequestSerializer();
}

class _$OwnerNoteRequestSerializer implements PrimitiveSerializer<OwnerNoteRequest> {
  @override
  final Iterable<Type> types = const [OwnerNoteRequest, _$OwnerNoteRequest];

  @override
  final String wireName = r'OwnerNoteRequest';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    OwnerNoteRequest object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    yield r'expectedRevision';
    yield serializers.serialize(
      object.expectedRevision,
      specifiedType: const FullType(int),
    );
    yield r'text';
    yield serializers.serialize(
      object.text,
      specifiedType: const FullType(String),
    );
  }

  @override
  Object serialize(
    Serializers serializers,
    OwnerNoteRequest object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required OwnerNoteRequestBuilder result,
    required List<Object?> unhandled,
  }) {
    for (var i = 0; i < serializedList.length; i += 2) {
      final key = serializedList[i] as String;
      final value = serializedList[i + 1];
      switch (key) {
        case r'expectedRevision':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(int),
          ) as int;
          result.expectedRevision = valueDes;
          break;
        case r'text':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.text = valueDes;
          break;
        default:
          unhandled.add(key);
          unhandled.add(value);
          break;
      }
    }
  }

  @override
  OwnerNoteRequest deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = OwnerNoteRequestBuilder();
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
