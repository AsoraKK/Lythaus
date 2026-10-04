//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'monthly_context_review_response.g.dart';

/// MonthlyContextReviewResponse
///
/// Properties:
/// * [reviewId]
/// * [revision]
/// * [sourceEventId]
/// * [created]
@BuiltValue()
abstract class MonthlyContextReviewResponse implements Built<MonthlyContextReviewResponse, MonthlyContextReviewResponseBuilder> {
  @BuiltValueField(wireName: r'reviewId')
  String get reviewId;

  @BuiltValueField(wireName: r'revision')
  int get revision;

  @BuiltValueField(wireName: r'sourceEventId')
  String get sourceEventId;

  @BuiltValueField(wireName: r'created')
  bool get created;

  MonthlyContextReviewResponse._();

  factory MonthlyContextReviewResponse([void updates(MonthlyContextReviewResponseBuilder b)]) = _$MonthlyContextReviewResponse;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(MonthlyContextReviewResponseBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<MonthlyContextReviewResponse> get serializer => _$MonthlyContextReviewResponseSerializer();
}

class _$MonthlyContextReviewResponseSerializer implements PrimitiveSerializer<MonthlyContextReviewResponse> {
  @override
  final Iterable<Type> types = const [MonthlyContextReviewResponse, _$MonthlyContextReviewResponse];

  @override
  final String wireName = r'MonthlyContextReviewResponse';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    MonthlyContextReviewResponse object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    yield r'reviewId';
    yield serializers.serialize(
      object.reviewId,
      specifiedType: const FullType(String),
    );
    yield r'revision';
    yield serializers.serialize(
      object.revision,
      specifiedType: const FullType(int),
    );
    yield r'sourceEventId';
    yield serializers.serialize(
      object.sourceEventId,
      specifiedType: const FullType(String),
    );
    yield r'created';
    yield serializers.serialize(
      object.created,
      specifiedType: const FullType(bool),
    );
  }

  @override
  Object serialize(
    Serializers serializers,
    MonthlyContextReviewResponse object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required MonthlyContextReviewResponseBuilder result,
    required List<Object?> unhandled,
  }) {
    for (var i = 0; i < serializedList.length; i += 2) {
      final key = serializedList[i] as String;
      final value = serializedList[i + 1];
      switch (key) {
        case r'reviewId':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.reviewId = valueDes;
          break;
        case r'revision':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(int),
          ) as int;
          result.revision = valueDes;
          break;
        case r'sourceEventId':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.sourceEventId = valueDes;
          break;
        case r'created':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(bool),
          ) as bool;
          result.created = valueDes;
          break;
        default:
          unhandled.add(key);
          unhandled.add(value);
          break;
      }
    }
  }

  @override
  MonthlyContextReviewResponse deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = MonthlyContextReviewResponseBuilder();
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
