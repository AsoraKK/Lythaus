//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:lythaus_api_client/src/model/support_feedback_policy_categories.dart';
import 'package:lythaus_api_client/src/model/support_feedback_policy_limits.dart';
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'support_feedback_policy.g.dart';

/// SupportFeedbackPolicy
///
/// Properties:
/// * [limits]
/// * [categories]
/// * [states]
@BuiltValue()
abstract class SupportFeedbackPolicy implements Built<SupportFeedbackPolicy, SupportFeedbackPolicyBuilder> {
  @BuiltValueField(wireName: r'limits')
  SupportFeedbackPolicyLimits get limits;

  @BuiltValueField(wireName: r'categories')
  SupportFeedbackPolicyCategories get categories;

  @BuiltValueField(wireName: r'states')
  SupportFeedbackPolicyCategories get states;

  SupportFeedbackPolicy._();

  factory SupportFeedbackPolicy([void updates(SupportFeedbackPolicyBuilder b)]) = _$SupportFeedbackPolicy;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(SupportFeedbackPolicyBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<SupportFeedbackPolicy> get serializer => _$SupportFeedbackPolicySerializer();
}

class _$SupportFeedbackPolicySerializer implements PrimitiveSerializer<SupportFeedbackPolicy> {
  @override
  final Iterable<Type> types = const [SupportFeedbackPolicy, _$SupportFeedbackPolicy];

  @override
  final String wireName = r'SupportFeedbackPolicy';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    SupportFeedbackPolicy object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    yield r'limits';
    yield serializers.serialize(
      object.limits,
      specifiedType: const FullType(SupportFeedbackPolicyLimits),
    );
    yield r'categories';
    yield serializers.serialize(
      object.categories,
      specifiedType: const FullType(SupportFeedbackPolicyCategories),
    );
    yield r'states';
    yield serializers.serialize(
      object.states,
      specifiedType: const FullType(SupportFeedbackPolicyCategories),
    );
  }

  @override
  Object serialize(
    Serializers serializers,
    SupportFeedbackPolicy object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required SupportFeedbackPolicyBuilder result,
    required List<Object?> unhandled,
  }) {
    for (var i = 0; i < serializedList.length; i += 2) {
      final key = serializedList[i] as String;
      final value = serializedList[i + 1];
      switch (key) {
        case r'limits':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(SupportFeedbackPolicyLimits),
          ) as SupportFeedbackPolicyLimits;
          result.limits.replace(valueDes);
          break;
        case r'categories':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(SupportFeedbackPolicyCategories),
          ) as SupportFeedbackPolicyCategories;
          result.categories.replace(valueDes);
          break;
        case r'states':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(SupportFeedbackPolicyCategories),
          ) as SupportFeedbackPolicyCategories;
          result.states.replace(valueDes);
          break;
        default:
          unhandled.add(key);
          unhandled.add(value);
          break;
      }
    }
  }

  @override
  SupportFeedbackPolicy deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = SupportFeedbackPolicyBuilder();
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
