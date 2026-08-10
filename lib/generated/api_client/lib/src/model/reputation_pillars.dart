//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'reputation_pillars.g.dart';

/// ReputationPillars
///
/// Properties:
/// * [accountability]
/// * [contribution]
/// * [conduct]
/// * [sourcing]
/// * [authenticity]
/// * [reviewReliability]
@BuiltValue()
abstract class ReputationPillars implements Built<ReputationPillars, ReputationPillarsBuilder> {
  @BuiltValueField(wireName: r'accountability')
  num get accountability;

  @BuiltValueField(wireName: r'contribution')
  num get contribution;

  @BuiltValueField(wireName: r'conduct')
  num get conduct;

  @BuiltValueField(wireName: r'sourcing')
  num get sourcing;

  @BuiltValueField(wireName: r'authenticity')
  num get authenticity;

  @BuiltValueField(wireName: r'reviewReliability')
  num get reviewReliability;

  ReputationPillars._();

  factory ReputationPillars([void updates(ReputationPillarsBuilder b)]) = _$ReputationPillars;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(ReputationPillarsBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<ReputationPillars> get serializer => _$ReputationPillarsSerializer();
}

class _$ReputationPillarsSerializer implements PrimitiveSerializer<ReputationPillars> {
  @override
  final Iterable<Type> types = const [ReputationPillars, _$ReputationPillars];

  @override
  final String wireName = r'ReputationPillars';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    ReputationPillars object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    yield r'accountability';
    yield serializers.serialize(
      object.accountability,
      specifiedType: const FullType(num),
    );
    yield r'contribution';
    yield serializers.serialize(
      object.contribution,
      specifiedType: const FullType(num),
    );
    yield r'conduct';
    yield serializers.serialize(
      object.conduct,
      specifiedType: const FullType(num),
    );
    yield r'sourcing';
    yield serializers.serialize(
      object.sourcing,
      specifiedType: const FullType(num),
    );
    yield r'authenticity';
    yield serializers.serialize(
      object.authenticity,
      specifiedType: const FullType(num),
    );
    yield r'reviewReliability';
    yield serializers.serialize(
      object.reviewReliability,
      specifiedType: const FullType(num),
    );
  }

  @override
  Object serialize(
    Serializers serializers,
    ReputationPillars object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required ReputationPillarsBuilder result,
    required List<Object?> unhandled,
  }) {
    for (var i = 0; i < serializedList.length; i += 2) {
      final key = serializedList[i] as String;
      final value = serializedList[i + 1];
      switch (key) {
        case r'accountability':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(num),
          ) as num;
          result.accountability = valueDes;
          break;
        case r'contribution':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(num),
          ) as num;
          result.contribution = valueDes;
          break;
        case r'conduct':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(num),
          ) as num;
          result.conduct = valueDes;
          break;
        case r'sourcing':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(num),
          ) as num;
          result.sourcing = valueDes;
          break;
        case r'authenticity':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(num),
          ) as num;
          result.authenticity = valueDes;
          break;
        case r'reviewReliability':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(num),
          ) as num;
          result.reviewReliability = valueDes;
          break;
        default:
          unhandled.add(key);
          unhandled.add(value);
          break;
      }
    }
  }

  @override
  ReputationPillars deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = ReputationPillarsBuilder();
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
