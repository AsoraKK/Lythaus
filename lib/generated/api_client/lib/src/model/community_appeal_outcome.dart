//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:lythaus_api_client/src/model/community_appeal_outcome_result.dart';
import 'package:built_collection/built_collection.dart';
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'community_appeal_outcome.g.dart';

/// CommunityAppealOutcome
///
/// Properties:
/// * [restoration]
/// * [result]
@BuiltValue()
abstract class CommunityAppealOutcome implements Built<CommunityAppealOutcome, CommunityAppealOutcomeBuilder> {
  @BuiltValueField(wireName: r'restoration')
  CommunityAppealOutcomeRestorationEnum get restoration;
  // enum restorationEnum {  not_applicable,  restored,  content_changed_or_deleted,  independent_hold,  publication_rule_hold,  };

  @BuiltValueField(wireName: r'result')
  CommunityAppealOutcomeResult get result;

  CommunityAppealOutcome._();

  factory CommunityAppealOutcome([void updates(CommunityAppealOutcomeBuilder b)]) = _$CommunityAppealOutcome;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(CommunityAppealOutcomeBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<CommunityAppealOutcome> get serializer => _$CommunityAppealOutcomeSerializer();
}

class _$CommunityAppealOutcomeSerializer implements PrimitiveSerializer<CommunityAppealOutcome> {
  @override
  final Iterable<Type> types = const [CommunityAppealOutcome, _$CommunityAppealOutcome];

  @override
  final String wireName = r'CommunityAppealOutcome';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    CommunityAppealOutcome object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    yield r'restoration';
    yield serializers.serialize(
      object.restoration,
      specifiedType: const FullType(CommunityAppealOutcomeRestorationEnum),
    );
    yield r'result';
    yield serializers.serialize(
      object.result,
      specifiedType: const FullType(CommunityAppealOutcomeResult),
    );
  }

  @override
  Object serialize(
    Serializers serializers,
    CommunityAppealOutcome object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required CommunityAppealOutcomeBuilder result,
    required List<Object?> unhandled,
  }) {
    for (var i = 0; i < serializedList.length; i += 2) {
      final key = serializedList[i] as String;
      final value = serializedList[i + 1];
      switch (key) {
        case r'restoration':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(CommunityAppealOutcomeRestorationEnum),
          ) as CommunityAppealOutcomeRestorationEnum;
          result.restoration = valueDes;
          break;
        case r'result':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(CommunityAppealOutcomeResult),
          ) as CommunityAppealOutcomeResult;
          result.result.replace(valueDes);
          break;
        default:
          unhandled.add(key);
          unhandled.add(value);
          break;
      }
    }
  }

  @override
  CommunityAppealOutcome deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = CommunityAppealOutcomeBuilder();
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

class CommunityAppealOutcomeRestorationEnum extends EnumClass {

  @BuiltValueEnumConst(wireName: r'not_applicable')
  static const CommunityAppealOutcomeRestorationEnum notApplicable = _$communityAppealOutcomeRestorationEnum_notApplicable;
  @BuiltValueEnumConst(wireName: r'restored')
  static const CommunityAppealOutcomeRestorationEnum restored = _$communityAppealOutcomeRestorationEnum_restored;
  @BuiltValueEnumConst(wireName: r'content_changed_or_deleted')
  static const CommunityAppealOutcomeRestorationEnum contentChangedOrDeleted = _$communityAppealOutcomeRestorationEnum_contentChangedOrDeleted;
  @BuiltValueEnumConst(wireName: r'independent_hold')
  static const CommunityAppealOutcomeRestorationEnum independentHold = _$communityAppealOutcomeRestorationEnum_independentHold;
  @BuiltValueEnumConst(wireName: r'publication_rule_hold')
  static const CommunityAppealOutcomeRestorationEnum publicationRuleHold = _$communityAppealOutcomeRestorationEnum_publicationRuleHold;

  static Serializer<CommunityAppealOutcomeRestorationEnum> get serializer => _$communityAppealOutcomeRestorationEnumSerializer;

  const CommunityAppealOutcomeRestorationEnum._(String name): super(name);

  static BuiltSet<CommunityAppealOutcomeRestorationEnum> get values => _$communityAppealOutcomeRestorationEnumValues;
  static CommunityAppealOutcomeRestorationEnum valueOf(String name) => _$communityAppealOutcomeRestorationEnumValueOf(name);
}
