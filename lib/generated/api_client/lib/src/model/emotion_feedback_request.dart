//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:built_collection/built_collection.dart';
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'emotion_feedback_request.g.dart';

/// EmotionFeedbackRequest
///
/// Properties:
/// * [value] - Null removes the current emotional reaction.
@BuiltValue()
abstract class EmotionFeedbackRequest implements Built<EmotionFeedbackRequest, EmotionFeedbackRequestBuilder> {
  /// Null removes the current emotional reaction.
  @BuiltValueField(wireName: r'value')
  EmotionFeedbackRequestValueEnum? get value;
  // enum valueEnum {  amused,  sad,  angry,  surprised,  appreciative,  };

  EmotionFeedbackRequest._();

  factory EmotionFeedbackRequest([void updates(EmotionFeedbackRequestBuilder b)]) = _$EmotionFeedbackRequest;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(EmotionFeedbackRequestBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<EmotionFeedbackRequest> get serializer => _$EmotionFeedbackRequestSerializer();
}

class _$EmotionFeedbackRequestSerializer implements PrimitiveSerializer<EmotionFeedbackRequest> {
  @override
  final Iterable<Type> types = const [EmotionFeedbackRequest, _$EmotionFeedbackRequest];

  @override
  final String wireName = r'EmotionFeedbackRequest';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    EmotionFeedbackRequest object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    yield r'value';
    yield object.value == null ? null : serializers.serialize(
      object.value,
      specifiedType: const FullType.nullable(EmotionFeedbackRequestValueEnum),
    );
  }

  @override
  Object serialize(
    Serializers serializers,
    EmotionFeedbackRequest object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required EmotionFeedbackRequestBuilder result,
    required List<Object?> unhandled,
  }) {
    for (var i = 0; i < serializedList.length; i += 2) {
      final key = serializedList[i] as String;
      final value = serializedList[i + 1];
      switch (key) {
        case r'value':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType.nullable(EmotionFeedbackRequestValueEnum),
          ) as EmotionFeedbackRequestValueEnum?;
          if (valueDes == null) continue;
          result.value = valueDes;
          break;
        default:
          unhandled.add(key);
          unhandled.add(value);
          break;
      }
    }
  }

  @override
  EmotionFeedbackRequest deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = EmotionFeedbackRequestBuilder();
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

class EmotionFeedbackRequestValueEnum extends EnumClass {

  /// Null removes the current emotional reaction.
  @BuiltValueEnumConst(wireName: r'amused')
  static const EmotionFeedbackRequestValueEnum amused = _$emotionFeedbackRequestValueEnum_amused;
  /// Null removes the current emotional reaction.
  @BuiltValueEnumConst(wireName: r'sad')
  static const EmotionFeedbackRequestValueEnum sad = _$emotionFeedbackRequestValueEnum_sad;
  /// Null removes the current emotional reaction.
  @BuiltValueEnumConst(wireName: r'angry')
  static const EmotionFeedbackRequestValueEnum angry = _$emotionFeedbackRequestValueEnum_angry;
  /// Null removes the current emotional reaction.
  @BuiltValueEnumConst(wireName: r'surprised')
  static const EmotionFeedbackRequestValueEnum surprised = _$emotionFeedbackRequestValueEnum_surprised;
  /// Null removes the current emotional reaction.
  @BuiltValueEnumConst(wireName: r'appreciative')
  static const EmotionFeedbackRequestValueEnum appreciative = _$emotionFeedbackRequestValueEnum_appreciative;

  static Serializer<EmotionFeedbackRequestValueEnum> get serializer => _$emotionFeedbackRequestValueEnumSerializer;

  const EmotionFeedbackRequestValueEnum._(String name): super(name);

  static BuiltSet<EmotionFeedbackRequestValueEnum> get values => _$emotionFeedbackRequestValueEnumValues;
  static EmotionFeedbackRequestValueEnum valueOf(String name) => _$emotionFeedbackRequestValueEnumValueOf(name);
}
