//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'alpha_feedback.g.dart';

/// AlphaFeedback
///
/// Properties:
/// * [message]
@BuiltValue()
abstract class AlphaFeedback implements Built<AlphaFeedback, AlphaFeedbackBuilder> {
  @BuiltValueField(wireName: r'message')
  String get message;

  AlphaFeedback._();

  factory AlphaFeedback([void updates(AlphaFeedbackBuilder b)]) = _$AlphaFeedback;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(AlphaFeedbackBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<AlphaFeedback> get serializer => _$AlphaFeedbackSerializer();
}

class _$AlphaFeedbackSerializer implements PrimitiveSerializer<AlphaFeedback> {
  @override
  final Iterable<Type> types = const [AlphaFeedback, _$AlphaFeedback];

  @override
  final String wireName = r'AlphaFeedback';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    AlphaFeedback object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    yield r'message';
    yield serializers.serialize(
      object.message,
      specifiedType: const FullType(String),
    );
  }

  @override
  Object serialize(
    Serializers serializers,
    AlphaFeedback object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required AlphaFeedbackBuilder result,
    required List<Object?> unhandled,
  }) {
    for (var i = 0; i < serializedList.length; i += 2) {
      final key = serializedList[i] as String;
      final value = serializedList[i + 1];
      switch (key) {
        case r'message':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.message = valueDes;
          break;
        default:
          unhandled.add(key);
          unhandled.add(value);
          break;
      }
    }
  }

  @override
  AlphaFeedback deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = AlphaFeedbackBuilder();
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
