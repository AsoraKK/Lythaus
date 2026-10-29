//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'contribution_quality_counts.g.dart';

/// ContributionQualityCounts
///
/// Properties:
/// * [like]
/// * [dislike]
@BuiltValue()
abstract class ContributionQualityCounts implements Built<ContributionQualityCounts, ContributionQualityCountsBuilder> {
  @BuiltValueField(wireName: r'like')
  int get like;

  @BuiltValueField(wireName: r'dislike')
  int get dislike;

  ContributionQualityCounts._();

  factory ContributionQualityCounts([void updates(ContributionQualityCountsBuilder b)]) = _$ContributionQualityCounts;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(ContributionQualityCountsBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<ContributionQualityCounts> get serializer => _$ContributionQualityCountsSerializer();
}

class _$ContributionQualityCountsSerializer implements PrimitiveSerializer<ContributionQualityCounts> {
  @override
  final Iterable<Type> types = const [ContributionQualityCounts, _$ContributionQualityCounts];

  @override
  final String wireName = r'ContributionQualityCounts';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    ContributionQualityCounts object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    yield r'like';
    yield serializers.serialize(
      object.like,
      specifiedType: const FullType(int),
    );
    yield r'dislike';
    yield serializers.serialize(
      object.dislike,
      specifiedType: const FullType(int),
    );
  }

  @override
  Object serialize(
    Serializers serializers,
    ContributionQualityCounts object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required ContributionQualityCountsBuilder result,
    required List<Object?> unhandled,
  }) {
    for (var i = 0; i < serializedList.length; i += 2) {
      final key = serializedList[i] as String;
      final value = serializedList[i + 1];
      switch (key) {
        case r'like':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(int),
          ) as int;
          result.like = valueDes;
          break;
        case r'dislike':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(int),
          ) as int;
          result.dislike = valueDes;
          break;
        default:
          unhandled.add(key);
          unhandled.add(value);
          break;
      }
    }
  }

  @override
  ContributionQualityCounts deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = ContributionQualityCountsBuilder();
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
