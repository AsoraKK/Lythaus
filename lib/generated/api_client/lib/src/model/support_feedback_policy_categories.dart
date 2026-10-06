//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:built_collection/built_collection.dart';
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'support_feedback_policy_categories.g.dart';

/// SupportFeedbackPolicyCategories
///
/// Properties:
/// * [problem]
/// * [suggestion]
@BuiltValue()
abstract class SupportFeedbackPolicyCategories implements Built<SupportFeedbackPolicyCategories, SupportFeedbackPolicyCategoriesBuilder> {
  @BuiltValueField(wireName: r'problem')
  BuiltList<String> get problem;

  @BuiltValueField(wireName: r'suggestion')
  BuiltList<String> get suggestion;

  SupportFeedbackPolicyCategories._();

  factory SupportFeedbackPolicyCategories([void updates(SupportFeedbackPolicyCategoriesBuilder b)]) = _$SupportFeedbackPolicyCategories;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(SupportFeedbackPolicyCategoriesBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<SupportFeedbackPolicyCategories> get serializer => _$SupportFeedbackPolicyCategoriesSerializer();
}

class _$SupportFeedbackPolicyCategoriesSerializer implements PrimitiveSerializer<SupportFeedbackPolicyCategories> {
  @override
  final Iterable<Type> types = const [SupportFeedbackPolicyCategories, _$SupportFeedbackPolicyCategories];

  @override
  final String wireName = r'SupportFeedbackPolicyCategories';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    SupportFeedbackPolicyCategories object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    yield r'problem';
    yield serializers.serialize(
      object.problem,
      specifiedType: const FullType(BuiltList, [FullType(String)]),
    );
    yield r'suggestion';
    yield serializers.serialize(
      object.suggestion,
      specifiedType: const FullType(BuiltList, [FullType(String)]),
    );
  }

  @override
  Object serialize(
    Serializers serializers,
    SupportFeedbackPolicyCategories object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required SupportFeedbackPolicyCategoriesBuilder result,
    required List<Object?> unhandled,
  }) {
    for (var i = 0; i < serializedList.length; i += 2) {
      final key = serializedList[i] as String;
      final value = serializedList[i + 1];
      switch (key) {
        case r'problem':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(BuiltList, [FullType(String)]),
          ) as BuiltList<String>;
          result.problem.replace(valueDes);
          break;
        case r'suggestion':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(BuiltList, [FullType(String)]),
          ) as BuiltList<String>;
          result.suggestion.replace(valueDes);
          break;
        default:
          unhandled.add(key);
          unhandled.add(value);
          break;
      }
    }
  }

  @override
  SupportFeedbackPolicyCategories deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = SupportFeedbackPolicyCategoriesBuilder();
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
