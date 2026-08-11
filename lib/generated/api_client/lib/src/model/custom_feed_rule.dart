//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'custom_feed_rule.g.dart';

/// CustomFeedRule
///
/// Properties:
/// * [topic]
/// * [regionCode]
@BuiltValue()
abstract class CustomFeedRule implements Built<CustomFeedRule, CustomFeedRuleBuilder> {
  @BuiltValueField(wireName: r'topic')
  String? get topic;

  @BuiltValueField(wireName: r'regionCode')
  String? get regionCode;

  CustomFeedRule._();

  factory CustomFeedRule([void updates(CustomFeedRuleBuilder b)]) = _$CustomFeedRule;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(CustomFeedRuleBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<CustomFeedRule> get serializer => _$CustomFeedRuleSerializer();
}

class _$CustomFeedRuleSerializer implements PrimitiveSerializer<CustomFeedRule> {
  @override
  final Iterable<Type> types = const [CustomFeedRule, _$CustomFeedRule];

  @override
  final String wireName = r'CustomFeedRule';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    CustomFeedRule object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    if (object.topic != null) {
      yield r'topic';
      yield serializers.serialize(
        object.topic,
        specifiedType: const FullType(String),
      );
    }
    if (object.regionCode != null) {
      yield r'regionCode';
      yield serializers.serialize(
        object.regionCode,
        specifiedType: const FullType(String),
      );
    }
  }

  @override
  Object serialize(
    Serializers serializers,
    CustomFeedRule object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required CustomFeedRuleBuilder result,
    required List<Object?> unhandled,
  }) {
    for (var i = 0; i < serializedList.length; i += 2) {
      final key = serializedList[i] as String;
      final value = serializedList[i + 1];
      switch (key) {
        case r'topic':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.topic = valueDes;
          break;
        case r'regionCode':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.regionCode = valueDes;
          break;
        default:
          unhandled.add(key);
          unhandled.add(value);
          break;
      }
    }
  }

  @override
  CustomFeedRule deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = CustomFeedRuleBuilder();
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
