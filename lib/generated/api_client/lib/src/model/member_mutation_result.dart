//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:lythaus_api_client/src/model/member_support_request.dart';
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'member_mutation_result.g.dart';

/// MemberMutationResult
///
/// Properties:
/// * [request]
/// * [recordId]
/// * [replayed]
@BuiltValue()
abstract class MemberMutationResult implements Built<MemberMutationResult, MemberMutationResultBuilder> {
  @BuiltValueField(wireName: r'request')
  MemberSupportRequest get request;

  @BuiltValueField(wireName: r'recordId')
  String? get recordId;

  @BuiltValueField(wireName: r'replayed')
  bool get replayed;

  MemberMutationResult._();

  factory MemberMutationResult([void updates(MemberMutationResultBuilder b)]) = _$MemberMutationResult;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(MemberMutationResultBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<MemberMutationResult> get serializer => _$MemberMutationResultSerializer();
}

class _$MemberMutationResultSerializer implements PrimitiveSerializer<MemberMutationResult> {
  @override
  final Iterable<Type> types = const [MemberMutationResult, _$MemberMutationResult];

  @override
  final String wireName = r'MemberMutationResult';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    MemberMutationResult object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    yield r'request';
    yield serializers.serialize(
      object.request,
      specifiedType: const FullType(MemberSupportRequest),
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
    MemberMutationResult object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required MemberMutationResultBuilder result,
    required List<Object?> unhandled,
  }) {
    for (var i = 0; i < serializedList.length; i += 2) {
      final key = serializedList[i] as String;
      final value = serializedList[i + 1];
      switch (key) {
        case r'request':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(MemberSupportRequest),
          ) as MemberSupportRequest;
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
  MemberMutationResult deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = MemberMutationResultBuilder();
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
