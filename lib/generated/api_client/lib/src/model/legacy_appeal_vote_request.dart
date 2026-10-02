//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:built_collection/built_collection.dart';
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'legacy_appeal_vote_request.g.dart';

/// LegacyAppealVoteRequest
///
/// Properties:
/// * [decision]
@BuiltValue()
abstract class LegacyAppealVoteRequest implements Built<LegacyAppealVoteRequest, LegacyAppealVoteRequestBuilder> {
  @BuiltValueField(wireName: r'decision')
  LegacyAppealVoteRequestDecisionEnum get decision;
  // enum decisionEnum {  overturn,  uphold,  };

  LegacyAppealVoteRequest._();

  factory LegacyAppealVoteRequest([void updates(LegacyAppealVoteRequestBuilder b)]) = _$LegacyAppealVoteRequest;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(LegacyAppealVoteRequestBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<LegacyAppealVoteRequest> get serializer => _$LegacyAppealVoteRequestSerializer();
}

class _$LegacyAppealVoteRequestSerializer implements PrimitiveSerializer<LegacyAppealVoteRequest> {
  @override
  final Iterable<Type> types = const [LegacyAppealVoteRequest, _$LegacyAppealVoteRequest];

  @override
  final String wireName = r'LegacyAppealVoteRequest';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    LegacyAppealVoteRequest object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    yield r'decision';
    yield serializers.serialize(
      object.decision,
      specifiedType: const FullType(LegacyAppealVoteRequestDecisionEnum),
    );
  }

  @override
  Object serialize(
    Serializers serializers,
    LegacyAppealVoteRequest object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required LegacyAppealVoteRequestBuilder result,
    required List<Object?> unhandled,
  }) {
    for (var i = 0; i < serializedList.length; i += 2) {
      final key = serializedList[i] as String;
      final value = serializedList[i + 1];
      switch (key) {
        case r'decision':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(LegacyAppealVoteRequestDecisionEnum),
          ) as LegacyAppealVoteRequestDecisionEnum;
          result.decision = valueDes;
          break;
        default:
          unhandled.add(key);
          unhandled.add(value);
          break;
      }
    }
  }

  @override
  LegacyAppealVoteRequest deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = LegacyAppealVoteRequestBuilder();
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

class LegacyAppealVoteRequestDecisionEnum extends EnumClass {

  @BuiltValueEnumConst(wireName: r'overturn')
  static const LegacyAppealVoteRequestDecisionEnum overturn = _$legacyAppealVoteRequestDecisionEnum_overturn;
  @BuiltValueEnumConst(wireName: r'uphold')
  static const LegacyAppealVoteRequestDecisionEnum uphold = _$legacyAppealVoteRequestDecisionEnum_uphold;

  static Serializer<LegacyAppealVoteRequestDecisionEnum> get serializer => _$legacyAppealVoteRequestDecisionEnumSerializer;

  const LegacyAppealVoteRequestDecisionEnum._(String name): super(name);

  static BuiltSet<LegacyAppealVoteRequestDecisionEnum> get values => _$legacyAppealVoteRequestDecisionEnumValues;
  static LegacyAppealVoteRequestDecisionEnum valueOf(String name) => _$legacyAppealVoteRequestDecisionEnumValueOf(name);
}
