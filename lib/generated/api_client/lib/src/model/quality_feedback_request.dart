//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:built_collection/built_collection.dart';
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'quality_feedback_request.g.dart';

/// QualityFeedbackRequest
///
/// Properties:
/// * [value] - Null removes the current quality vote.
@BuiltValue()
abstract class QualityFeedbackRequest implements Built<QualityFeedbackRequest, QualityFeedbackRequestBuilder> {
  /// Null removes the current quality vote.
  @BuiltValueField(wireName: r'value')
  QualityFeedbackRequestValueEnum? get value;
  // enum valueEnum {  like,  dislike,  };

  QualityFeedbackRequest._();

  factory QualityFeedbackRequest([void updates(QualityFeedbackRequestBuilder b)]) = _$QualityFeedbackRequest;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(QualityFeedbackRequestBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<QualityFeedbackRequest> get serializer => _$QualityFeedbackRequestSerializer();
}

class _$QualityFeedbackRequestSerializer implements PrimitiveSerializer<QualityFeedbackRequest> {
  @override
  final Iterable<Type> types = const [QualityFeedbackRequest, _$QualityFeedbackRequest];

  @override
  final String wireName = r'QualityFeedbackRequest';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    QualityFeedbackRequest object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    yield r'value';
    yield object.value == null ? null : serializers.serialize(
      object.value,
      specifiedType: const FullType.nullable(QualityFeedbackRequestValueEnum),
    );
  }

  @override
  Object serialize(
    Serializers serializers,
    QualityFeedbackRequest object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required QualityFeedbackRequestBuilder result,
    required List<Object?> unhandled,
  }) {
    for (var i = 0; i < serializedList.length; i += 2) {
      final key = serializedList[i] as String;
      final value = serializedList[i + 1];
      switch (key) {
        case r'value':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType.nullable(QualityFeedbackRequestValueEnum),
          ) as QualityFeedbackRequestValueEnum?;
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
  QualityFeedbackRequest deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = QualityFeedbackRequestBuilder();
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

class QualityFeedbackRequestValueEnum extends EnumClass {

  /// Null removes the current quality vote.
  @BuiltValueEnumConst(wireName: r'like')
  static const QualityFeedbackRequestValueEnum like = _$qualityFeedbackRequestValueEnum_like;
  /// Null removes the current quality vote.
  @BuiltValueEnumConst(wireName: r'dislike')
  static const QualityFeedbackRequestValueEnum dislike = _$qualityFeedbackRequestValueEnum_dislike;

  static Serializer<QualityFeedbackRequestValueEnum> get serializer => _$qualityFeedbackRequestValueEnumSerializer;

  const QualityFeedbackRequestValueEnum._(String name): super(name);

  static BuiltSet<QualityFeedbackRequestValueEnum> get values => _$qualityFeedbackRequestValueEnumValues;
  static QualityFeedbackRequestValueEnum valueOf(String name) => _$qualityFeedbackRequestValueEnumValueOf(name);
}
