//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:lythaus_api_client/src/model/contribution_emotion_counts.dart';
import 'package:built_collection/built_collection.dart';
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'contribution_emotion.g.dart';

/// ContributionEmotion
///
/// Properties:
/// * [counts]
/// * [myValue]
@BuiltValue()
abstract class ContributionEmotion implements Built<ContributionEmotion, ContributionEmotionBuilder> {
  @BuiltValueField(wireName: r'counts')
  ContributionEmotionCounts get counts;

  @BuiltValueField(wireName: r'myValue')
  ContributionEmotionMyValueEnum? get myValue;
  // enum myValueEnum {  amused,  sad,  angry,  surprised,  appreciative,  };

  ContributionEmotion._();

  factory ContributionEmotion([void updates(ContributionEmotionBuilder b)]) = _$ContributionEmotion;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(ContributionEmotionBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<ContributionEmotion> get serializer => _$ContributionEmotionSerializer();
}

class _$ContributionEmotionSerializer implements PrimitiveSerializer<ContributionEmotion> {
  @override
  final Iterable<Type> types = const [ContributionEmotion, _$ContributionEmotion];

  @override
  final String wireName = r'ContributionEmotion';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    ContributionEmotion object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    yield r'counts';
    yield serializers.serialize(
      object.counts,
      specifiedType: const FullType(ContributionEmotionCounts),
    );
    yield r'myValue';
    yield object.myValue == null ? null : serializers.serialize(
      object.myValue,
      specifiedType: const FullType.nullable(ContributionEmotionMyValueEnum),
    );
  }

  @override
  Object serialize(
    Serializers serializers,
    ContributionEmotion object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required ContributionEmotionBuilder result,
    required List<Object?> unhandled,
  }) {
    for (var i = 0; i < serializedList.length; i += 2) {
      final key = serializedList[i] as String;
      final value = serializedList[i + 1];
      switch (key) {
        case r'counts':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(ContributionEmotionCounts),
          ) as ContributionEmotionCounts;
          result.counts.replace(valueDes);
          break;
        case r'myValue':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType.nullable(ContributionEmotionMyValueEnum),
          ) as ContributionEmotionMyValueEnum?;
          if (valueDes == null) continue;
          result.myValue = valueDes;
          break;
        default:
          unhandled.add(key);
          unhandled.add(value);
          break;
      }
    }
  }

  @override
  ContributionEmotion deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = ContributionEmotionBuilder();
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

class ContributionEmotionMyValueEnum extends EnumClass {

  @BuiltValueEnumConst(wireName: r'amused')
  static const ContributionEmotionMyValueEnum amused = _$contributionEmotionMyValueEnum_amused;
  @BuiltValueEnumConst(wireName: r'sad')
  static const ContributionEmotionMyValueEnum sad = _$contributionEmotionMyValueEnum_sad;
  @BuiltValueEnumConst(wireName: r'angry')
  static const ContributionEmotionMyValueEnum angry = _$contributionEmotionMyValueEnum_angry;
  @BuiltValueEnumConst(wireName: r'surprised')
  static const ContributionEmotionMyValueEnum surprised = _$contributionEmotionMyValueEnum_surprised;
  @BuiltValueEnumConst(wireName: r'appreciative')
  static const ContributionEmotionMyValueEnum appreciative = _$contributionEmotionMyValueEnum_appreciative;

  static Serializer<ContributionEmotionMyValueEnum> get serializer => _$contributionEmotionMyValueEnumSerializer;

  const ContributionEmotionMyValueEnum._(String name): super(name);

  static BuiltSet<ContributionEmotionMyValueEnum> get values => _$contributionEmotionMyValueEnumValues;
  static ContributionEmotionMyValueEnum valueOf(String name) => _$contributionEmotionMyValueEnumValueOf(name);
}
