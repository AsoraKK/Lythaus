//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'reaction_counts.g.dart';

/// Current reaction totals by supported reaction type.
///
/// Properties:
/// * [like]
/// * [insightful]
/// * [support]
@BuiltValue()
abstract class ReactionCounts implements Built<ReactionCounts, ReactionCountsBuilder> {
  @BuiltValueField(wireName: r'like')
  int? get like;

  @BuiltValueField(wireName: r'insightful')
  int? get insightful;

  @BuiltValueField(wireName: r'support')
  int? get support;

  ReactionCounts._();

  factory ReactionCounts([void updates(ReactionCountsBuilder b)]) = _$ReactionCounts;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(ReactionCountsBuilder b) => b
      ..like = 0
      ..insightful = 0
      ..support = 0;

  @BuiltValueSerializer(custom: true)
  static Serializer<ReactionCounts> get serializer => _$ReactionCountsSerializer();
}

class _$ReactionCountsSerializer implements PrimitiveSerializer<ReactionCounts> {
  @override
  final Iterable<Type> types = const [ReactionCounts, _$ReactionCounts];

  @override
  final String wireName = r'ReactionCounts';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    ReactionCounts object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    if (object.like != null) {
      yield r'like';
      yield serializers.serialize(
        object.like,
        specifiedType: const FullType(int),
      );
    }
    if (object.insightful != null) {
      yield r'insightful';
      yield serializers.serialize(
        object.insightful,
        specifiedType: const FullType(int),
      );
    }
    if (object.support != null) {
      yield r'support';
      yield serializers.serialize(
        object.support,
        specifiedType: const FullType(int),
      );
    }
  }

  @override
  Object serialize(
    Serializers serializers,
    ReactionCounts object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required ReactionCountsBuilder result,
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
        case r'insightful':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(int),
          ) as int;
          result.insightful = valueDes;
          break;
        case r'support':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(int),
          ) as int;
          result.support = valueDes;
          break;
        default:
          unhandled.add(key);
          unhandled.add(value);
          break;
      }
    }
  }

  @override
  ReactionCounts deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = ReactionCountsBuilder();
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
