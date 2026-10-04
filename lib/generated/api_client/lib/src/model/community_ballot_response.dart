//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:built_collection/built_collection.dart';
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'community_ballot_response.g.dart';

/// CommunityBallotResponse
///
/// Properties:
/// * [ballotId]
/// * [revision]
/// * [choice]
/// * [castAt]
/// * [created]
@BuiltValue()
abstract class CommunityBallotResponse implements Built<CommunityBallotResponse, CommunityBallotResponseBuilder> {
  @BuiltValueField(wireName: r'ballotId')
  String get ballotId;

  @BuiltValueField(wireName: r'revision')
  int get revision;

  @BuiltValueField(wireName: r'choice')
  CommunityBallotResponseChoiceEnum get choice;
  // enum choiceEnum {  allow,  retain,  recuse,  cannot_assess,  };

  @BuiltValueField(wireName: r'castAt')
  DateTime get castAt;

  @BuiltValueField(wireName: r'created')
  bool get created;

  CommunityBallotResponse._();

  factory CommunityBallotResponse([void updates(CommunityBallotResponseBuilder b)]) = _$CommunityBallotResponse;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(CommunityBallotResponseBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<CommunityBallotResponse> get serializer => _$CommunityBallotResponseSerializer();
}

class _$CommunityBallotResponseSerializer implements PrimitiveSerializer<CommunityBallotResponse> {
  @override
  final Iterable<Type> types = const [CommunityBallotResponse, _$CommunityBallotResponse];

  @override
  final String wireName = r'CommunityBallotResponse';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    CommunityBallotResponse object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    yield r'ballotId';
    yield serializers.serialize(
      object.ballotId,
      specifiedType: const FullType(String),
    );
    yield r'revision';
    yield serializers.serialize(
      object.revision,
      specifiedType: const FullType(int),
    );
    yield r'choice';
    yield serializers.serialize(
      object.choice,
      specifiedType: const FullType(CommunityBallotResponseChoiceEnum),
    );
    yield r'castAt';
    yield serializers.serialize(
      object.castAt,
      specifiedType: const FullType(DateTime),
    );
    yield r'created';
    yield serializers.serialize(
      object.created,
      specifiedType: const FullType(bool),
    );
  }

  @override
  Object serialize(
    Serializers serializers,
    CommunityBallotResponse object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required CommunityBallotResponseBuilder result,
    required List<Object?> unhandled,
  }) {
    for (var i = 0; i < serializedList.length; i += 2) {
      final key = serializedList[i] as String;
      final value = serializedList[i + 1];
      switch (key) {
        case r'ballotId':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.ballotId = valueDes;
          break;
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
            specifiedType: const FullType(CommunityBallotResponseChoiceEnum),
          ) as CommunityBallotResponseChoiceEnum;
          result.choice = valueDes;
          break;
        case r'castAt':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(DateTime),
          ) as DateTime;
          result.castAt = valueDes;
          break;
        case r'created':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(bool),
          ) as bool;
          result.created = valueDes;
          break;
        default:
          unhandled.add(key);
          unhandled.add(value);
          break;
      }
    }
  }

  @override
  CommunityBallotResponse deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = CommunityBallotResponseBuilder();
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

class CommunityBallotResponseChoiceEnum extends EnumClass {

  @BuiltValueEnumConst(wireName: r'allow')
  static const CommunityBallotResponseChoiceEnum allow = _$communityBallotResponseChoiceEnum_allow;
  @BuiltValueEnumConst(wireName: r'retain')
  static const CommunityBallotResponseChoiceEnum retain = _$communityBallotResponseChoiceEnum_retain;
  @BuiltValueEnumConst(wireName: r'recuse')
  static const CommunityBallotResponseChoiceEnum recuse = _$communityBallotResponseChoiceEnum_recuse;
  @BuiltValueEnumConst(wireName: r'cannot_assess')
  static const CommunityBallotResponseChoiceEnum cannotAssess = _$communityBallotResponseChoiceEnum_cannotAssess;

  static Serializer<CommunityBallotResponseChoiceEnum> get serializer => _$communityBallotResponseChoiceEnumSerializer;

  const CommunityBallotResponseChoiceEnum._(String name): super(name);

  static BuiltSet<CommunityBallotResponseChoiceEnum> get values => _$communityBallotResponseChoiceEnumValues;
  static CommunityBallotResponseChoiceEnum valueOf(String name) => _$communityBallotResponseChoiceEnumValueOf(name);
}
