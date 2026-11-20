//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:lythaus_api_client/src/model/contribution_emotion.dart';
import 'package:lythaus_api_client/src/model/contribution_quality.dart';
import 'package:lythaus_api_client/src/model/contribution_feedback_target.dart';
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'contribution_feedback_summary.g.dart';

/// ContributionFeedbackSummary
///
/// Properties:
/// * [target]
/// * [quality]
/// * [emotion]
@BuiltValue()
abstract class ContributionFeedbackSummary implements Built<ContributionFeedbackSummary, ContributionFeedbackSummaryBuilder> {
  @BuiltValueField(wireName: r'target')
  ContributionFeedbackTarget get target;

  @BuiltValueField(wireName: r'quality')
  ContributionQuality get quality;

  @BuiltValueField(wireName: r'emotion')
  ContributionEmotion get emotion;

  ContributionFeedbackSummary._();

  factory ContributionFeedbackSummary([void updates(ContributionFeedbackSummaryBuilder b)]) = _$ContributionFeedbackSummary;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(ContributionFeedbackSummaryBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<ContributionFeedbackSummary> get serializer => _$ContributionFeedbackSummarySerializer();
}

class _$ContributionFeedbackSummarySerializer implements PrimitiveSerializer<ContributionFeedbackSummary> {
  @override
  final Iterable<Type> types = const [ContributionFeedbackSummary, _$ContributionFeedbackSummary];

  @override
  final String wireName = r'ContributionFeedbackSummary';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    ContributionFeedbackSummary object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    yield r'target';
    yield serializers.serialize(
      object.target,
      specifiedType: const FullType(ContributionFeedbackTarget),
    );
    yield r'quality';
    yield serializers.serialize(
      object.quality,
      specifiedType: const FullType(ContributionQuality),
    );
    yield r'emotion';
    yield serializers.serialize(
      object.emotion,
      specifiedType: const FullType(ContributionEmotion),
    );
  }

  @override
  Object serialize(
    Serializers serializers,
    ContributionFeedbackSummary object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required ContributionFeedbackSummaryBuilder result,
    required List<Object?> unhandled,
  }) {
    for (var i = 0; i < serializedList.length; i += 2) {
      final key = serializedList[i] as String;
      final value = serializedList[i + 1];
      switch (key) {
        case r'target':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(ContributionFeedbackTarget),
          ) as ContributionFeedbackTarget;
          result.target.replace(valueDes);
          break;
        case r'quality':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(ContributionQuality),
          ) as ContributionQuality;
          result.quality.replace(valueDes);
          break;
        case r'emotion':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(ContributionEmotion),
          ) as ContributionEmotion;
          result.emotion.replace(valueDes);
          break;
        default:
          unhandled.add(key);
          unhandled.add(value);
          break;
      }
    }
  }

  @override
  ContributionFeedbackSummary deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = ContributionFeedbackSummaryBuilder();
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
