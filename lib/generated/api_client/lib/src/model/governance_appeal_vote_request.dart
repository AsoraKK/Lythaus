//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:built_collection/built_collection.dart';
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'governance_appeal_vote_request.g.dart';

/// GovernanceAppealVoteRequest
///
/// Properties:
/// * [decision]
@BuiltValue()
abstract class GovernanceAppealVoteRequest implements Built<GovernanceAppealVoteRequest, GovernanceAppealVoteRequestBuilder> {
  @BuiltValueField(wireName: r'decision')
  GovernanceAppealVoteRequestDecisionEnum get decision;
  // enum decisionEnum {  overturn,  uphold,  };

  GovernanceAppealVoteRequest._();

  factory GovernanceAppealVoteRequest([void updates(GovernanceAppealVoteRequestBuilder b)]) = _$GovernanceAppealVoteRequest;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(GovernanceAppealVoteRequestBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<GovernanceAppealVoteRequest> get serializer => _$GovernanceAppealVoteRequestSerializer();
}

class _$GovernanceAppealVoteRequestSerializer implements PrimitiveSerializer<GovernanceAppealVoteRequest> {
  @override
  final Iterable<Type> types = const [GovernanceAppealVoteRequest, _$GovernanceAppealVoteRequest];

  @override
  final String wireName = r'GovernanceAppealVoteRequest';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    GovernanceAppealVoteRequest object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    yield r'decision';
    yield serializers.serialize(
      object.decision,
      specifiedType: const FullType(GovernanceAppealVoteRequestDecisionEnum),
    );
  }

  @override
  Object serialize(
    Serializers serializers,
    GovernanceAppealVoteRequest object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required GovernanceAppealVoteRequestBuilder result,
    required List<Object?> unhandled,
  }) {
    for (var i = 0; i < serializedList.length; i += 2) {
      final key = serializedList[i] as String;
      final value = serializedList[i + 1];
      switch (key) {
        case r'decision':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(GovernanceAppealVoteRequestDecisionEnum),
          ) as GovernanceAppealVoteRequestDecisionEnum;
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
  GovernanceAppealVoteRequest deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = GovernanceAppealVoteRequestBuilder();
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

class GovernanceAppealVoteRequestDecisionEnum extends EnumClass {

  @BuiltValueEnumConst(wireName: r'overturn')
  static const GovernanceAppealVoteRequestDecisionEnum overturn = _$governanceAppealVoteRequestDecisionEnum_overturn;
  @BuiltValueEnumConst(wireName: r'uphold')
  static const GovernanceAppealVoteRequestDecisionEnum uphold = _$governanceAppealVoteRequestDecisionEnum_uphold;

  static Serializer<GovernanceAppealVoteRequestDecisionEnum> get serializer => _$governanceAppealVoteRequestDecisionEnumSerializer;

  const GovernanceAppealVoteRequestDecisionEnum._(String name): super(name);

  static BuiltSet<GovernanceAppealVoteRequestDecisionEnum> get values => _$governanceAppealVoteRequestDecisionEnumValues;
  static GovernanceAppealVoteRequestDecisionEnum valueOf(String name) => _$governanceAppealVoteRequestDecisionEnumValueOf(name);
}
