//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:built_collection/built_collection.dart';
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'community_own_ballot.g.dart';

/// CommunityOwnBallot
///
/// Properties:
/// * [revision]
/// * [choice]
/// * [reasonCode]
/// * [castAt]
@BuiltValue()
abstract class CommunityOwnBallot implements Built<CommunityOwnBallot, CommunityOwnBallotBuilder> {
  @BuiltValueField(wireName: r'revision')
  int get revision;

  @BuiltValueField(wireName: r'choice')
  CommunityOwnBallotChoiceEnum get choice;
  // enum choiceEnum {  allow,  retain,  recuse,  cannot_assess,  };

  @BuiltValueField(wireName: r'reason_code')
  CommunityOwnBallotReasonCodeEnum get reasonCode;
  // enum reasonCodeEnum {  rule_misapplied,  rule_applies,  conflict,  insufficient_context,  };

  @BuiltValueField(wireName: r'cast_at')
  DateTime get castAt;

  CommunityOwnBallot._();

  factory CommunityOwnBallot([void updates(CommunityOwnBallotBuilder b)]) = _$CommunityOwnBallot;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(CommunityOwnBallotBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<CommunityOwnBallot> get serializer => _$CommunityOwnBallotSerializer();
}

class _$CommunityOwnBallotSerializer implements PrimitiveSerializer<CommunityOwnBallot> {
  @override
  final Iterable<Type> types = const [CommunityOwnBallot, _$CommunityOwnBallot];

  @override
  final String wireName = r'CommunityOwnBallot';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    CommunityOwnBallot object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    yield r'revision';
    yield serializers.serialize(
      object.revision,
      specifiedType: const FullType(int),
    );
    yield r'choice';
    yield serializers.serialize(
      object.choice,
      specifiedType: const FullType(CommunityOwnBallotChoiceEnum),
    );
    yield r'reason_code';
    yield serializers.serialize(
      object.reasonCode,
      specifiedType: const FullType(CommunityOwnBallotReasonCodeEnum),
    );
    yield r'cast_at';
    yield serializers.serialize(
      object.castAt,
      specifiedType: const FullType(DateTime),
    );
  }

  @override
  Object serialize(
    Serializers serializers,
    CommunityOwnBallot object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required CommunityOwnBallotBuilder result,
    required List<Object?> unhandled,
  }) {
    for (var i = 0; i < serializedList.length; i += 2) {
      final key = serializedList[i] as String;
      final value = serializedList[i + 1];
      switch (key) {
        case r'revision':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(int),
          ) as int;
          result.revision = valueDes;
          break;
        case r'choice':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(CommunityOwnBallotChoiceEnum),
          ) as CommunityOwnBallotChoiceEnum;
          result.choice = valueDes;
          break;
        case r'reason_code':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(CommunityOwnBallotReasonCodeEnum),
          ) as CommunityOwnBallotReasonCodeEnum;
          result.reasonCode = valueDes;
          break;
        case r'cast_at':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(DateTime),
          ) as DateTime;
          result.castAt = valueDes;
          break;
        default:
          unhandled.add(key);
          unhandled.add(value);
          break;
      }
    }
  }

  @override
  CommunityOwnBallot deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = CommunityOwnBallotBuilder();
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

class CommunityOwnBallotChoiceEnum extends EnumClass {

  @BuiltValueEnumConst(wireName: r'allow')
  static const CommunityOwnBallotChoiceEnum allow = _$communityOwnBallotChoiceEnum_allow;
  @BuiltValueEnumConst(wireName: r'retain')
  static const CommunityOwnBallotChoiceEnum retain = _$communityOwnBallotChoiceEnum_retain;
  @BuiltValueEnumConst(wireName: r'recuse')
  static const CommunityOwnBallotChoiceEnum recuse = _$communityOwnBallotChoiceEnum_recuse;
  @BuiltValueEnumConst(wireName: r'cannot_assess')
  static const CommunityOwnBallotChoiceEnum cannotAssess = _$communityOwnBallotChoiceEnum_cannotAssess;

  static Serializer<CommunityOwnBallotChoiceEnum> get serializer => _$communityOwnBallotChoiceEnumSerializer;

  const CommunityOwnBallotChoiceEnum._(String name): super(name);

  static BuiltSet<CommunityOwnBallotChoiceEnum> get values => _$communityOwnBallotChoiceEnumValues;
  static CommunityOwnBallotChoiceEnum valueOf(String name) => _$communityOwnBallotChoiceEnumValueOf(name);
}

class CommunityOwnBallotReasonCodeEnum extends EnumClass {

  @BuiltValueEnumConst(wireName: r'rule_misapplied')
  static const CommunityOwnBallotReasonCodeEnum ruleMisapplied = _$communityOwnBallotReasonCodeEnum_ruleMisapplied;
  @BuiltValueEnumConst(wireName: r'rule_applies')
  static const CommunityOwnBallotReasonCodeEnum ruleApplies = _$communityOwnBallotReasonCodeEnum_ruleApplies;
  @BuiltValueEnumConst(wireName: r'conflict')
  static const CommunityOwnBallotReasonCodeEnum conflict = _$communityOwnBallotReasonCodeEnum_conflict;
  @BuiltValueEnumConst(wireName: r'insufficient_context')
  static const CommunityOwnBallotReasonCodeEnum insufficientContext = _$communityOwnBallotReasonCodeEnum_insufficientContext;

  static Serializer<CommunityOwnBallotReasonCodeEnum> get serializer => _$communityOwnBallotReasonCodeEnumSerializer;

  const CommunityOwnBallotReasonCodeEnum._(String name): super(name);

  static BuiltSet<CommunityOwnBallotReasonCodeEnum> get values => _$communityOwnBallotReasonCodeEnumValues;
  static CommunityOwnBallotReasonCodeEnum valueOf(String name) => _$communityOwnBallotReasonCodeEnumValueOf(name);
}
