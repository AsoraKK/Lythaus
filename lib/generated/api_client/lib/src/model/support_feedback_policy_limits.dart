//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'support_feedback_policy_limits.g.dart';

/// Optional character limits count Unicode scalar values after trimming. UTF-8 byte limits remain independently enforced.
///
/// Properties:
/// * [titleBytes]
/// * [detailBytes]
/// * [stepsBytes]
/// * [contextBytes]
/// * [memberMessageBytes]
/// * [titleCharacters]
/// * [detailCharacters]
/// * [stepsCharacters]
/// * [memberMessageCharacters]
@BuiltValue()
abstract class SupportFeedbackPolicyLimits implements Built<SupportFeedbackPolicyLimits, SupportFeedbackPolicyLimitsBuilder> {
  @BuiltValueField(wireName: r'titleBytes')
  int get titleBytes;

  @BuiltValueField(wireName: r'detailBytes')
  int get detailBytes;

  @BuiltValueField(wireName: r'stepsBytes')
  int get stepsBytes;

  @BuiltValueField(wireName: r'contextBytes')
  int get contextBytes;

  @BuiltValueField(wireName: r'memberMessageBytes')
  int get memberMessageBytes;

  @BuiltValueField(wireName: r'titleCharacters')
  int? get titleCharacters;

  @BuiltValueField(wireName: r'detailCharacters')
  int? get detailCharacters;

  @BuiltValueField(wireName: r'stepsCharacters')
  int? get stepsCharacters;

  @BuiltValueField(wireName: r'memberMessageCharacters')
  int? get memberMessageCharacters;

  SupportFeedbackPolicyLimits._();

  factory SupportFeedbackPolicyLimits([void updates(SupportFeedbackPolicyLimitsBuilder b)]) = _$SupportFeedbackPolicyLimits;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(SupportFeedbackPolicyLimitsBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<SupportFeedbackPolicyLimits> get serializer => _$SupportFeedbackPolicyLimitsSerializer();
}

class _$SupportFeedbackPolicyLimitsSerializer implements PrimitiveSerializer<SupportFeedbackPolicyLimits> {
  @override
  final Iterable<Type> types = const [SupportFeedbackPolicyLimits, _$SupportFeedbackPolicyLimits];

  @override
  final String wireName = r'SupportFeedbackPolicyLimits';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    SupportFeedbackPolicyLimits object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    yield r'titleBytes';
    yield serializers.serialize(
      object.titleBytes,
      specifiedType: const FullType(int),
    );
    yield r'detailBytes';
    yield serializers.serialize(
      object.detailBytes,
      specifiedType: const FullType(int),
    );
    yield r'stepsBytes';
    yield serializers.serialize(
      object.stepsBytes,
      specifiedType: const FullType(int),
    );
    yield r'contextBytes';
    yield serializers.serialize(
      object.contextBytes,
      specifiedType: const FullType(int),
    );
    yield r'memberMessageBytes';
    yield serializers.serialize(
      object.memberMessageBytes,
      specifiedType: const FullType(int),
    );
    if (object.titleCharacters != null) {
      yield r'titleCharacters';
      yield serializers.serialize(
        object.titleCharacters,
        specifiedType: const FullType(int),
      );
    }
    if (object.detailCharacters != null) {
      yield r'detailCharacters';
      yield serializers.serialize(
        object.detailCharacters,
        specifiedType: const FullType(int),
      );
    }
    if (object.stepsCharacters != null) {
      yield r'stepsCharacters';
      yield serializers.serialize(
        object.stepsCharacters,
        specifiedType: const FullType(int),
      );
    }
    if (object.memberMessageCharacters != null) {
      yield r'memberMessageCharacters';
      yield serializers.serialize(
        object.memberMessageCharacters,
        specifiedType: const FullType(int),
      );
    }
  }

  @override
  Object serialize(
    Serializers serializers,
    SupportFeedbackPolicyLimits object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required SupportFeedbackPolicyLimitsBuilder result,
    required List<Object?> unhandled,
  }) {
    for (var i = 0; i < serializedList.length; i += 2) {
      final key = serializedList[i] as String;
      final value = serializedList[i + 1];
      switch (key) {
        case r'titleBytes':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(int),
          ) as int;
          result.titleBytes = valueDes;
          break;
        case r'detailBytes':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(int),
          ) as int;
          result.detailBytes = valueDes;
          break;
        case r'stepsBytes':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(int),
          ) as int;
          result.stepsBytes = valueDes;
          break;
        case r'contextBytes':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(int),
          ) as int;
          result.contextBytes = valueDes;
          break;
        case r'memberMessageBytes':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(int),
          ) as int;
          result.memberMessageBytes = valueDes;
          break;
        case r'titleCharacters':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(int),
          ) as int;
          result.titleCharacters = valueDes;
          break;
        case r'detailCharacters':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(int),
          ) as int;
          result.detailCharacters = valueDes;
          break;
        case r'stepsCharacters':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(int),
          ) as int;
          result.stepsCharacters = valueDes;
          break;
        case r'memberMessageCharacters':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(int),
          ) as int;
          result.memberMessageCharacters = valueDes;
          break;
        default:
          unhandled.add(key);
          unhandled.add(value);
          break;
      }
    }
  }

  @override
  SupportFeedbackPolicyLimits deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = SupportFeedbackPolicyLimitsBuilder();
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
