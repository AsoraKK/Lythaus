//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:built_collection/built_collection.dart';
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'owner_decision_request.g.dart';

/// OwnerDecisionRequest
///
/// Properties:
/// * [expectedRevision]
/// * [state]
/// * [reason]
/// * [memberMessage]
/// * [evidenceIds]
@BuiltValue()
abstract class OwnerDecisionRequest implements Built<OwnerDecisionRequest, OwnerDecisionRequestBuilder> {
  @BuiltValueField(wireName: r'expectedRevision')
  int get expectedRevision;

  @BuiltValueField(wireName: r'state')
  String get state;

  @BuiltValueField(wireName: r'reason')
  String get reason;

  @BuiltValueField(wireName: r'memberMessage')
  String get memberMessage;

  @BuiltValueField(wireName: r'evidenceIds')
  BuiltList<String> get evidenceIds;

  OwnerDecisionRequest._();

  factory OwnerDecisionRequest([void updates(OwnerDecisionRequestBuilder b)]) = _$OwnerDecisionRequest;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(OwnerDecisionRequestBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<OwnerDecisionRequest> get serializer => _$OwnerDecisionRequestSerializer();
}

class _$OwnerDecisionRequestSerializer implements PrimitiveSerializer<OwnerDecisionRequest> {
  @override
  final Iterable<Type> types = const [OwnerDecisionRequest, _$OwnerDecisionRequest];

  @override
  final String wireName = r'OwnerDecisionRequest';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    OwnerDecisionRequest object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    yield r'expectedRevision';
    yield serializers.serialize(
      object.expectedRevision,
      specifiedType: const FullType(int),
    );
    yield r'state';
    yield serializers.serialize(
      object.state,
      specifiedType: const FullType(String),
    );
    yield r'reason';
    yield serializers.serialize(
      object.reason,
      specifiedType: const FullType(String),
    );
    yield r'memberMessage';
    yield serializers.serialize(
      object.memberMessage,
      specifiedType: const FullType(String),
    );
    yield r'evidenceIds';
    yield serializers.serialize(
      object.evidenceIds,
      specifiedType: const FullType(BuiltList, [FullType(String)]),
    );
  }

  @override
  Object serialize(
    Serializers serializers,
    OwnerDecisionRequest object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required OwnerDecisionRequestBuilder result,
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
        case r'state':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.state = valueDes;
          break;
        case r'reason':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.reason = valueDes;
          break;
        case r'memberMessage':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.memberMessage = valueDes;
          break;
        case r'evidenceIds':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(BuiltList, [FullType(String)]),
          ) as BuiltList<String>;
          result.evidenceIds.replace(valueDes);
          break;
        default:
          unhandled.add(key);
          unhandled.add(value);
          break;
      }
    }
  }

  @override
  OwnerDecisionRequest deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = OwnerDecisionRequestBuilder();
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
