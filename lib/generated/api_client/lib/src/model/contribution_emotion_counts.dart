//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'contribution_emotion_counts.g.dart';

/// ContributionEmotionCounts
///
/// Properties:
/// * [amused]
/// * [sad]
/// * [angry]
/// * [surprised]
/// * [appreciative]
@BuiltValue()
abstract class ContributionEmotionCounts implements Built<ContributionEmotionCounts, ContributionEmotionCountsBuilder> {
  @BuiltValueField(wireName: r'amused')
  int get amused;

  @BuiltValueField(wireName: r'sad')
  int get sad;

  @BuiltValueField(wireName: r'angry')
  int get angry;

  @BuiltValueField(wireName: r'surprised')
  int get surprised;

  @BuiltValueField(wireName: r'appreciative')
  int get appreciative;

  ContributionEmotionCounts._();

  factory ContributionEmotionCounts([void updates(ContributionEmotionCountsBuilder b)]) = _$ContributionEmotionCounts;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(ContributionEmotionCountsBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<ContributionEmotionCounts> get serializer => _$ContributionEmotionCountsSerializer();
}

class _$ContributionEmotionCountsSerializer implements PrimitiveSerializer<ContributionEmotionCounts> {
  @override
  final Iterable<Type> types = const [ContributionEmotionCounts, _$ContributionEmotionCounts];

  @override
  final String wireName = r'ContributionEmotionCounts';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    ContributionEmotionCounts object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    yield r'amused';
    yield serializers.serialize(
      object.amused,
      specifiedType: const FullType(int),
    );
    yield r'sad';
    yield serializers.serialize(
      object.sad,
      specifiedType: const FullType(int),
    );
    yield r'angry';
    yield serializers.serialize(
      object.angry,
      specifiedType: const FullType(int),
    );
    yield r'surprised';
    yield serializers.serialize(
      object.surprised,
      specifiedType: const FullType(int),
    );
    yield r'appreciative';
    yield serializers.serialize(
      object.appreciative,
      specifiedType: const FullType(int),
    );
  }

  @override
  Object serialize(
    Serializers serializers,
    ContributionEmotionCounts object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required ContributionEmotionCountsBuilder result,
    required List<Object?> unhandled,
  }) {
    for (var i = 0; i < serializedList.length; i += 2) {
      final key = serializedList[i] as String;
      final value = serializedList[i + 1];
      switch (key) {
        case r'amused':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(int),
          ) as int;
          result.amused = valueDes;
          break;
        case r'sad':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(int),
          ) as int;
          result.sad = valueDes;
          break;
        case r'angry':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(int),
          ) as int;
          result.angry = valueDes;
          break;
        case r'surprised':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(int),
          ) as int;
          result.surprised = valueDes;
          break;
        case r'appreciative':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(int),
          ) as int;
          result.appreciative = valueDes;
          break;
        default:
          unhandled.add(key);
          unhandled.add(value);
          break;
      }
    }
  }

  @override
  ContributionEmotionCounts deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = ContributionEmotionCountsBuilder();
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
