//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:lythaus_api_client/src/model/owner_support_request.dart';
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'owner_mutation_result.g.dart';

/// OwnerMutationResult
///
/// Properties:
/// * [request]
/// * [recordId]
/// * [replayed]
@BuiltValue()
abstract class OwnerMutationResult implements Built<OwnerMutationResult, OwnerMutationResultBuilder> {
  @BuiltValueField(wireName: r'request')
  OwnerSupportRequest get request;

  @BuiltValueField(wireName: r'recordId')
  String? get recordId;

  @BuiltValueField(wireName: r'replayed')
  bool get replayed;

  OwnerMutationResult._();

  factory OwnerMutationResult([void updates(OwnerMutationResultBuilder b)]) = _$OwnerMutationResult;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(OwnerMutationResultBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<OwnerMutationResult> get serializer => _$OwnerMutationResultSerializer();
}

class _$OwnerMutationResultSerializer implements PrimitiveSerializer<OwnerMutationResult> {
  @override
  final Iterable<Type> types = const [OwnerMutationResult, _$OwnerMutationResult];

  @override
  final String wireName = r'OwnerMutationResult';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    OwnerMutationResult object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    yield r'request';
    yield serializers.serialize(
      object.request,
      specifiedType: const FullType(OwnerSupportRequest),
    );
    yield r'recordId';
    yield object.recordId == null ? null : serializers.serialize(
      object.recordId,
      specifiedType: const FullType.nullable(String),
    );
    yield r'replayed';
    yield serializers.serialize(
      object.replayed,
      specifiedType: const FullType(bool),
    );
  }

  @override
  Object serialize(
    Serializers serializers,
    OwnerMutationResult object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required OwnerMutationResultBuilder result,
    required List<Object?> unhandled,
  }) {
    for (var i = 0; i < serializedList.length; i += 2) {
      final key = serializedList[i] as String;
      final value = serializedList[i + 1];
      switch (key) {
        case r'request':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(OwnerSupportRequest),
          ) as OwnerSupportRequest;
          result.request.replace(valueDes);
          break;
        case r'recordId':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType.nullable(String),
          ) as String?;
          if (valueDes == null) continue;
          result.recordId = valueDes;
          break;
        case r'replayed':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(bool),
          ) as bool;
          result.replayed = valueDes;
          break;
        default:
          unhandled.add(key);
          unhandled.add(value);
          break;
      }
    }
  }

  @override
  OwnerMutationResult deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = OwnerMutationResultBuilder();
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
