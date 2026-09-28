//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'beta_feedback.g.dart';

/// BetaFeedback
///
/// Properties:
/// * [message]
@BuiltValue()
abstract class BetaFeedback implements Built<BetaFeedback, BetaFeedbackBuilder> {
  @BuiltValueField(wireName: r'message')
  String get message;

  BetaFeedback._();

  factory BetaFeedback([void updates(BetaFeedbackBuilder b)]) = _$BetaFeedback;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(BetaFeedbackBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<BetaFeedback> get serializer => _$BetaFeedbackSerializer();
}

class _$BetaFeedbackSerializer implements PrimitiveSerializer<BetaFeedback> {
  @override
  final Iterable<Type> types = const [BetaFeedback, _$BetaFeedback];

  @override
  final String wireName = r'BetaFeedback';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    BetaFeedback object, {
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
    BetaFeedback object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required BetaFeedbackBuilder result,
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
  BetaFeedback deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = BetaFeedbackBuilder();
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
