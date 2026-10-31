//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:built_collection/built_collection.dart';
import 'package:lythaus_api_client/src/model/contribution_quality_counts.dart';
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'contribution_quality.g.dart';

/// ContributionQuality
///
/// Properties:
/// * [counts]
/// * [myValue]
@BuiltValue()
abstract class ContributionQuality implements Built<ContributionQuality, ContributionQualityBuilder> {
  @BuiltValueField(wireName: r'counts')
  ContributionQualityCounts get counts;

  @BuiltValueField(wireName: r'myValue')
  ContributionQualityMyValueEnum? get myValue;
  // enum myValueEnum {  like,  dislike,  };

  ContributionQuality._();

  factory ContributionQuality([void updates(ContributionQualityBuilder b)]) = _$ContributionQuality;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(ContributionQualityBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<ContributionQuality> get serializer => _$ContributionQualitySerializer();
}

class _$ContributionQualitySerializer implements PrimitiveSerializer<ContributionQuality> {
  @override
  final Iterable<Type> types = const [ContributionQuality, _$ContributionQuality];

  @override
  final String wireName = r'ContributionQuality';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    ContributionQuality object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    yield r'counts';
    yield serializers.serialize(
      object.counts,
      specifiedType: const FullType(ContributionQualityCounts),
    );
    yield r'myValue';
    yield object.myValue == null ? null : serializers.serialize(
      object.myValue,
      specifiedType: const FullType.nullable(ContributionQualityMyValueEnum),
    );
  }

  @override
  Object serialize(
    Serializers serializers,
    ContributionQuality object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required ContributionQualityBuilder result,
    required List<Object?> unhandled,
  }) {
    for (var i = 0; i < serializedList.length; i += 2) {
      final key = serializedList[i] as String;
      final value = serializedList[i + 1];
      switch (key) {
        case r'counts':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(ContributionQualityCounts),
          ) as ContributionQualityCounts;
          result.counts.replace(valueDes);
          break;
        case r'myValue':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType.nullable(ContributionQualityMyValueEnum),
          ) as ContributionQualityMyValueEnum?;
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
  ContributionQuality deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = ContributionQualityBuilder();
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

class ContributionQualityMyValueEnum extends EnumClass {

  @BuiltValueEnumConst(wireName: r'like')
  static const ContributionQualityMyValueEnum like = _$contributionQualityMyValueEnum_like;
  @BuiltValueEnumConst(wireName: r'dislike')
  static const ContributionQualityMyValueEnum dislike = _$contributionQualityMyValueEnum_dislike;

  static Serializer<ContributionQualityMyValueEnum> get serializer => _$contributionQualityMyValueEnumSerializer;

  const ContributionQualityMyValueEnum._(String name): super(name);

  static BuiltSet<ContributionQualityMyValueEnum> get values => _$contributionQualityMyValueEnumValues;
  static ContributionQualityMyValueEnum valueOf(String name) => _$contributionQualityMyValueEnumValueOf(name);
}
