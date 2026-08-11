//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:built_collection/built_collection.dart';
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'governance_appeal_vote_response.g.dart';

/// GovernanceAppealVoteResponse
///
/// Properties:
/// * [voteId]
/// * [appealId]
/// * [decision]
/// * [locked]
@BuiltValue()
abstract class GovernanceAppealVoteResponse implements Built<GovernanceAppealVoteResponse, GovernanceAppealVoteResponseBuilder> {
  @BuiltValueField(wireName: r'voteId')
  String get voteId;

  @BuiltValueField(wireName: r'appealId')
  String get appealId;

  @BuiltValueField(wireName: r'decision')
  GovernanceAppealVoteResponseDecisionEnum get decision;
  // enum decisionEnum {  overturn,  uphold,  };

  @BuiltValueField(wireName: r'locked')
  bool get locked;

  GovernanceAppealVoteResponse._();

  factory GovernanceAppealVoteResponse([void updates(GovernanceAppealVoteResponseBuilder b)]) = _$GovernanceAppealVoteResponse;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(GovernanceAppealVoteResponseBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<GovernanceAppealVoteResponse> get serializer => _$GovernanceAppealVoteResponseSerializer();
}

class _$GovernanceAppealVoteResponseSerializer implements PrimitiveSerializer<GovernanceAppealVoteResponse> {
  @override
  final Iterable<Type> types = const [GovernanceAppealVoteResponse, _$GovernanceAppealVoteResponse];

  @override
  final String wireName = r'GovernanceAppealVoteResponse';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    GovernanceAppealVoteResponse object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    yield r'voteId';
    yield serializers.serialize(
      object.voteId,
      specifiedType: const FullType(String),
    );
    yield r'appealId';
    yield serializers.serialize(
      object.appealId,
      specifiedType: const FullType(String),
    );
    yield r'decision';
    yield serializers.serialize(
      object.decision,
      specifiedType: const FullType(GovernanceAppealVoteResponseDecisionEnum),
    );
    yield r'locked';
    yield serializers.serialize(
      object.locked,
      specifiedType: const FullType(bool),
    );
  }

  @override
  Object serialize(
    Serializers serializers,
    GovernanceAppealVoteResponse object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required GovernanceAppealVoteResponseBuilder result,
    required List<Object?> unhandled,
  }) {
    for (var i = 0; i < serializedList.length; i += 2) {
      final key = serializedList[i] as String;
      final value = serializedList[i + 1];
      switch (key) {
        case r'voteId':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.voteId = valueDes;
          break;
        case r'appealId':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.appealId = valueDes;
          break;
        case r'decision':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(GovernanceAppealVoteResponseDecisionEnum),
          ) as GovernanceAppealVoteResponseDecisionEnum;
          result.decision = valueDes;
          break;
        case r'locked':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(bool),
          ) as bool;
          result.locked = valueDes;
          break;
        default:
          unhandled.add(key);
          unhandled.add(value);
          break;
      }
    }
  }

  @override
  GovernanceAppealVoteResponse deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = GovernanceAppealVoteResponseBuilder();
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

class GovernanceAppealVoteResponseDecisionEnum extends EnumClass {

  @BuiltValueEnumConst(wireName: r'overturn')
  static const GovernanceAppealVoteResponseDecisionEnum overturn = _$governanceAppealVoteResponseDecisionEnum_overturn;
  @BuiltValueEnumConst(wireName: r'uphold')
  static const GovernanceAppealVoteResponseDecisionEnum uphold = _$governanceAppealVoteResponseDecisionEnum_uphold;

  static Serializer<GovernanceAppealVoteResponseDecisionEnum> get serializer => _$governanceAppealVoteResponseDecisionEnumSerializer;

  const GovernanceAppealVoteResponseDecisionEnum._(String name): super(name);

  static BuiltSet<GovernanceAppealVoteResponseDecisionEnum> get values => _$governanceAppealVoteResponseDecisionEnumValues;
  static GovernanceAppealVoteResponseDecisionEnum valueOf(String name) => _$governanceAppealVoteResponseDecisionEnumValueOf(name);
}
