//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:built_collection/built_collection.dart';
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'monthly_context_review_error.g.dart';

/// MonthlyContextReviewError
///
/// Properties:
/// * [error]
/// * [correlationId]
@BuiltValue()
abstract class MonthlyContextReviewError implements Built<MonthlyContextReviewError, MonthlyContextReviewErrorBuilder> {
  @BuiltValueField(wireName: r'error')
  MonthlyContextReviewErrorErrorEnum get error;
  // enum errorEnum {  rate_limit_exceeded,  };

  @BuiltValueField(wireName: r'correlationId')
  String get correlationId;

  MonthlyContextReviewError._();

  factory MonthlyContextReviewError([void updates(MonthlyContextReviewErrorBuilder b)]) = _$MonthlyContextReviewError;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(MonthlyContextReviewErrorBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<MonthlyContextReviewError> get serializer => _$MonthlyContextReviewErrorSerializer();
}

class _$MonthlyContextReviewErrorSerializer implements PrimitiveSerializer<MonthlyContextReviewError> {
  @override
  final Iterable<Type> types = const [MonthlyContextReviewError, _$MonthlyContextReviewError];

  @override
  final String wireName = r'MonthlyContextReviewError';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    MonthlyContextReviewError object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    yield r'error';
    yield serializers.serialize(
      object.error,
      specifiedType: const FullType(MonthlyContextReviewErrorErrorEnum),
    );
    yield r'correlationId';
    yield serializers.serialize(
      object.correlationId,
      specifiedType: const FullType(String),
    );
  }

  @override
  Object serialize(
    Serializers serializers,
    MonthlyContextReviewError object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required MonthlyContextReviewErrorBuilder result,
    required List<Object?> unhandled,
  }) {
    for (var i = 0; i < serializedList.length; i += 2) {
      final key = serializedList[i] as String;
      final value = serializedList[i + 1];
      switch (key) {
        case r'error':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(MonthlyContextReviewErrorErrorEnum),
          ) as MonthlyContextReviewErrorErrorEnum;
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
  MonthlyContextReviewError deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = MonthlyContextReviewErrorBuilder();
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

class MonthlyContextReviewErrorErrorEnum extends EnumClass {

  @BuiltValueEnumConst(wireName: r'rate_limit_exceeded')
  static const MonthlyContextReviewErrorErrorEnum rateLimitExceeded = _$monthlyContextReviewErrorErrorEnum_rateLimitExceeded;

  static Serializer<MonthlyContextReviewErrorErrorEnum> get serializer => _$monthlyContextReviewErrorErrorEnumSerializer;

  const MonthlyContextReviewErrorErrorEnum._(String name): super(name);

  static BuiltSet<MonthlyContextReviewErrorErrorEnum> get values => _$monthlyContextReviewErrorErrorEnumValues;
  static MonthlyContextReviewErrorErrorEnum valueOf(String name) => _$monthlyContextReviewErrorErrorEnumValueOf(name);
}
