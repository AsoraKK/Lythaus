//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'owner_evidence_request.g.dart';

/// OwnerEvidenceRequest
///
/// Properties:
/// * [expectedRevision]
/// * [type]
/// * [description]
/// * [reference]
@BuiltValue()
abstract class OwnerEvidenceRequest implements Built<OwnerEvidenceRequest, OwnerEvidenceRequestBuilder> {
  @BuiltValueField(wireName: r'expectedRevision')
  int get expectedRevision;

  @BuiltValueField(wireName: r'type')
  String get type;

  @BuiltValueField(wireName: r'description')
  String get description;

  @BuiltValueField(wireName: r'reference')
  String? get reference;

  OwnerEvidenceRequest._();

  factory OwnerEvidenceRequest([void updates(OwnerEvidenceRequestBuilder b)]) = _$OwnerEvidenceRequest;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(OwnerEvidenceRequestBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<OwnerEvidenceRequest> get serializer => _$OwnerEvidenceRequestSerializer();
}

class _$OwnerEvidenceRequestSerializer implements PrimitiveSerializer<OwnerEvidenceRequest> {
  @override
  final Iterable<Type> types = const [OwnerEvidenceRequest, _$OwnerEvidenceRequest];

  @override
  final String wireName = r'OwnerEvidenceRequest';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    OwnerEvidenceRequest object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    yield r'expectedRevision';
    yield serializers.serialize(
      object.expectedRevision,
      specifiedType: const FullType(int),
    );
    yield r'type';
    yield serializers.serialize(
      object.type,
      specifiedType: const FullType(String),
    );
    yield r'description';
    yield serializers.serialize(
      object.description,
      specifiedType: const FullType(String),
    );
    if (object.reference != null) {
      yield r'reference';
      yield serializers.serialize(
        object.reference,
        specifiedType: const FullType.nullable(String),
      );
    }
  }

  @override
  Object serialize(
    Serializers serializers,
    OwnerEvidenceRequest object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required OwnerEvidenceRequestBuilder result,
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
        case r'type':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.type = valueDes;
          break;
        case r'description':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.description = valueDes;
          break;
        case r'reference':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType.nullable(String),
          ) as String?;
          if (valueDes == null) continue;
          result.reference = valueDes;
          break;
        default:
          unhandled.add(key);
          unhandled.add(value);
          break;
      }
    }
  }

  @override
  OwnerEvidenceRequest deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = OwnerEvidenceRequestBuilder();
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
