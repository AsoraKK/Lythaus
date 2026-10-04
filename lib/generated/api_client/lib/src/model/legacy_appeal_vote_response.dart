//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:built_collection/built_collection.dart';
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'legacy_appeal_vote_response.g.dart';

/// LegacyAppealVoteResponse
///
/// Properties:
/// * [voteId]
/// * [appealId]
/// * [decision]
/// * [locked]
@BuiltValue()
abstract class LegacyAppealVoteResponse implements Built<LegacyAppealVoteResponse, LegacyAppealVoteResponseBuilder> {
  @BuiltValueField(wireName: r'voteId')
  String get voteId;

  @BuiltValueField(wireName: r'appealId')
  String get appealId;

  @BuiltValueField(wireName: r'decision')
  LegacyAppealVoteResponseDecisionEnum get decision;
  // enum decisionEnum {  overturn,  uphold,  };

  @BuiltValueField(wireName: r'locked')
  bool get locked;

  LegacyAppealVoteResponse._();

  factory LegacyAppealVoteResponse([void updates(LegacyAppealVoteResponseBuilder b)]) = _$LegacyAppealVoteResponse;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(LegacyAppealVoteResponseBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<LegacyAppealVoteResponse> get serializer => _$LegacyAppealVoteResponseSerializer();
}

class _$LegacyAppealVoteResponseSerializer implements PrimitiveSerializer<LegacyAppealVoteResponse> {
  @override
  final Iterable<Type> types = const [LegacyAppealVoteResponse, _$LegacyAppealVoteResponse];

  @override
  final String wireName = r'LegacyAppealVoteResponse';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    LegacyAppealVoteResponse object, {
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
      specifiedType: const FullType(LegacyAppealVoteResponseDecisionEnum),
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
    LegacyAppealVoteResponse object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required LegacyAppealVoteResponseBuilder result,
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
            specifiedType: const FullType(LegacyAppealVoteResponseDecisionEnum),
          ) as LegacyAppealVoteResponseDecisionEnum;
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
  LegacyAppealVoteResponse deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = LegacyAppealVoteResponseBuilder();
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

class LegacyAppealVoteResponseDecisionEnum extends EnumClass {

  @BuiltValueEnumConst(wireName: r'overturn')
  static const LegacyAppealVoteResponseDecisionEnum overturn = _$legacyAppealVoteResponseDecisionEnum_overturn;
  @BuiltValueEnumConst(wireName: r'uphold')
  static const LegacyAppealVoteResponseDecisionEnum uphold = _$legacyAppealVoteResponseDecisionEnum_uphold;

  static Serializer<LegacyAppealVoteResponseDecisionEnum> get serializer => _$legacyAppealVoteResponseDecisionEnumSerializer;

  const LegacyAppealVoteResponseDecisionEnum._(String name): super(name);

  static BuiltSet<LegacyAppealVoteResponseDecisionEnum> get values => _$legacyAppealVoteResponseDecisionEnumValues;
  static LegacyAppealVoteResponseDecisionEnum valueOf(String name) => _$legacyAppealVoteResponseDecisionEnumValueOf(name);
}
