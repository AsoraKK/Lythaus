//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:built_collection/built_collection.dart';
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'community_ballot_request.g.dart';

/// CommunityBallotRequest
///
/// Properties:
/// * [choice]
/// * [reasonCode]
/// * [expectedRevision]
/// * [contextAcknowledged]
@BuiltValue()
abstract class CommunityBallotRequest implements Built<CommunityBallotRequest, CommunityBallotRequestBuilder> {
  @BuiltValueField(wireName: r'choice')
  CommunityBallotRequestChoiceEnum get choice;
  // enum choiceEnum {  allow,  retain,  recuse,  cannot_assess,  };

  @BuiltValueField(wireName: r'reasonCode')
  CommunityBallotRequestReasonCodeEnum get reasonCode;
  // enum reasonCodeEnum {  rule_misapplied,  rule_applies,  conflict,  insufficient_context,  };

  @BuiltValueField(wireName: r'expectedRevision')
  int get expectedRevision;

  @BuiltValueField(wireName: r'contextAcknowledged')
  bool get contextAcknowledged;

  CommunityBallotRequest._();

  factory CommunityBallotRequest([void updates(CommunityBallotRequestBuilder b)]) = _$CommunityBallotRequest;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(CommunityBallotRequestBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<CommunityBallotRequest> get serializer => _$CommunityBallotRequestSerializer();
}

class _$CommunityBallotRequestSerializer implements PrimitiveSerializer<CommunityBallotRequest> {
  @override
  final Iterable<Type> types = const [CommunityBallotRequest, _$CommunityBallotRequest];

  @override
  final String wireName = r'CommunityBallotRequest';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    CommunityBallotRequest object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    yield r'choice';
    yield serializers.serialize(
      object.choice,
      specifiedType: const FullType(CommunityBallotRequestChoiceEnum),
    );
    yield r'reasonCode';
    yield serializers.serialize(
      object.reasonCode,
      specifiedType: const FullType(CommunityBallotRequestReasonCodeEnum),
    );
    yield r'expectedRevision';
    yield serializers.serialize(
      object.expectedRevision,
      specifiedType: const FullType(int),
    );
    yield r'contextAcknowledged';
    yield serializers.serialize(
      object.contextAcknowledged,
      specifiedType: const FullType(bool),
    );
  }

  @override
  Object serialize(
    Serializers serializers,
    CommunityBallotRequest object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required CommunityBallotRequestBuilder result,
    required List<Object?> unhandled,
  }) {
    for (var i = 0; i < serializedList.length; i += 2) {
      final key = serializedList[i] as String;
      final value = serializedList[i + 1];
      switch (key) {
        case r'choice':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(CommunityBallotRequestChoiceEnum),
          ) as CommunityBallotRequestChoiceEnum;
          result.choice = valueDes;
          break;
        case r'reasonCode':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(CommunityBallotRequestReasonCodeEnum),
          ) as CommunityBallotRequestReasonCodeEnum;
          result.reasonCode = valueDes;
          break;
        case r'expectedRevision':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(int),
          ) as int;
          result.expectedRevision = valueDes;
          break;
        case r'contextAcknowledged':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(bool),
          ) as bool;
          result.contextAcknowledged = valueDes;
          break;
        default:
          unhandled.add(key);
          unhandled.add(value);
          break;
      }
    }
  }

  @override
  CommunityBallotRequest deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = CommunityBallotRequestBuilder();
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

class CommunityBallotRequestChoiceEnum extends EnumClass {

  @BuiltValueEnumConst(wireName: r'allow')
  static const CommunityBallotRequestChoiceEnum allow = _$communityBallotRequestChoiceEnum_allow;
  @BuiltValueEnumConst(wireName: r'retain')
  static const CommunityBallotRequestChoiceEnum retain = _$communityBallotRequestChoiceEnum_retain;
  @BuiltValueEnumConst(wireName: r'recuse')
  static const CommunityBallotRequestChoiceEnum recuse = _$communityBallotRequestChoiceEnum_recuse;
  @BuiltValueEnumConst(wireName: r'cannot_assess')
  static const CommunityBallotRequestChoiceEnum cannotAssess = _$communityBallotRequestChoiceEnum_cannotAssess;

  static Serializer<CommunityBallotRequestChoiceEnum> get serializer => _$communityBallotRequestChoiceEnumSerializer;

  const CommunityBallotRequestChoiceEnum._(String name): super(name);

  static BuiltSet<CommunityBallotRequestChoiceEnum> get values => _$communityBallotRequestChoiceEnumValues;
  static CommunityBallotRequestChoiceEnum valueOf(String name) => _$communityBallotRequestChoiceEnumValueOf(name);
}

class CommunityBallotRequestReasonCodeEnum extends EnumClass {

  @BuiltValueEnumConst(wireName: r'rule_misapplied')
  static const CommunityBallotRequestReasonCodeEnum ruleMisapplied = _$communityBallotRequestReasonCodeEnum_ruleMisapplied;
  @BuiltValueEnumConst(wireName: r'rule_applies')
  static const CommunityBallotRequestReasonCodeEnum ruleApplies = _$communityBallotRequestReasonCodeEnum_ruleApplies;
  @BuiltValueEnumConst(wireName: r'conflict')
  static const CommunityBallotRequestReasonCodeEnum conflict = _$communityBallotRequestReasonCodeEnum_conflict;
  @BuiltValueEnumConst(wireName: r'insufficient_context')
  static const CommunityBallotRequestReasonCodeEnum insufficientContext = _$communityBallotRequestReasonCodeEnum_insufficientContext;

  static Serializer<CommunityBallotRequestReasonCodeEnum> get serializer => _$communityBallotRequestReasonCodeEnumSerializer;

  const CommunityBallotRequestReasonCodeEnum._(String name): super(name);

  static BuiltSet<CommunityBallotRequestReasonCodeEnum> get values => _$communityBallotRequestReasonCodeEnumValues;
  static CommunityBallotRequestReasonCodeEnum valueOf(String name) => _$communityBallotRequestReasonCodeEnumValueOf(name);
}
