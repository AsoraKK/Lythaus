//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'contribution_feedback_error.g.dart';

/// ContributionFeedbackError
///
/// Properties:
/// * [error]
/// * [correlationId]
@BuiltValue()
abstract class ContributionFeedbackError implements Built<ContributionFeedbackError, ContributionFeedbackErrorBuilder> {
  @BuiltValueField(wireName: r'error')
  String get error;

  @BuiltValueField(wireName: r'correlationId')
  String? get correlationId;

  ContributionFeedbackError._();

  factory ContributionFeedbackError([void updates(ContributionFeedbackErrorBuilder b)]) = _$ContributionFeedbackError;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(ContributionFeedbackErrorBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<ContributionFeedbackError> get serializer => _$ContributionFeedbackErrorSerializer();
}

class _$ContributionFeedbackErrorSerializer implements PrimitiveSerializer<ContributionFeedbackError> {
  @override
  final Iterable<Type> types = const [ContributionFeedbackError, _$ContributionFeedbackError];

  @override
  final String wireName = r'ContributionFeedbackError';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    ContributionFeedbackError object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    yield r'error';
    yield serializers.serialize(
      object.error,
      specifiedType: const FullType(String),
    );
    if (object.correlationId != null) {
      yield r'correlationId';
      yield serializers.serialize(
        object.correlationId,
        specifiedType: const FullType(String),
      );
    }
  }

  @override
  Object serialize(
    Serializers serializers,
    ContributionFeedbackError object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required ContributionFeedbackErrorBuilder result,
    required List<Object?> unhandled,
  }) {
    for (var i = 0; i < serializedList.length; i += 2) {
      final key = serializedList[i] as String;
      final value = serializedList[i + 1];
      switch (key) {
        case r'error':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.error = valueDes;
          break;
        case r'correlationId':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.correlationId = valueDes;
          break;
        default:
          unhandled.add(key);
          unhandled.add(value);
          break;
      }
    }
  }

  @override
  ContributionFeedbackError deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = ContributionFeedbackErrorBuilder();
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
