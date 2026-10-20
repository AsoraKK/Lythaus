//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:built_collection/built_collection.dart';
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'subscription_status500_response.g.dart';

/// SubscriptionStatus500Response
///
/// Properties:
/// * [error]
/// * [correlationId]
@BuiltValue()
abstract class SubscriptionStatus500Response implements Built<SubscriptionStatus500Response, SubscriptionStatus500ResponseBuilder> {
  @BuiltValueField(wireName: r'error')
  SubscriptionStatus500ResponseErrorEnum get error;
  // enum errorEnum {  request_failed,  };

  @BuiltValueField(wireName: r'correlationId')
  String get correlationId;

  SubscriptionStatus500Response._();

  factory SubscriptionStatus500Response([void updates(SubscriptionStatus500ResponseBuilder b)]) = _$SubscriptionStatus500Response;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(SubscriptionStatus500ResponseBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<SubscriptionStatus500Response> get serializer => _$SubscriptionStatus500ResponseSerializer();
}

class _$SubscriptionStatus500ResponseSerializer implements PrimitiveSerializer<SubscriptionStatus500Response> {
  @override
  final Iterable<Type> types = const [SubscriptionStatus500Response, _$SubscriptionStatus500Response];

  @override
  final String wireName = r'SubscriptionStatus500Response';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    SubscriptionStatus500Response object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    yield r'error';
    yield serializers.serialize(
      object.error,
      specifiedType: const FullType(SubscriptionStatus500ResponseErrorEnum),
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
    SubscriptionStatus500Response object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required SubscriptionStatus500ResponseBuilder result,
    required List<Object?> unhandled,
  }) {
    for (var i = 0; i < serializedList.length; i += 2) {
      final key = serializedList[i] as String;
      final value = serializedList[i + 1];
      switch (key) {
        case r'error':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(SubscriptionStatus500ResponseErrorEnum),
          ) as SubscriptionStatus500ResponseErrorEnum;
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
  SubscriptionStatus500Response deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = SubscriptionStatus500ResponseBuilder();
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

class SubscriptionStatus500ResponseErrorEnum extends EnumClass {

  @BuiltValueEnumConst(wireName: r'request_failed')
  static const SubscriptionStatus500ResponseErrorEnum requestFailed = _$subscriptionStatus500ResponseErrorEnum_requestFailed;

  static Serializer<SubscriptionStatus500ResponseErrorEnum> get serializer => _$subscriptionStatus500ResponseErrorEnumSerializer;

  const SubscriptionStatus500ResponseErrorEnum._(String name): super(name);

  static BuiltSet<SubscriptionStatus500ResponseErrorEnum> get values => _$subscriptionStatus500ResponseErrorEnumValues;
  static SubscriptionStatus500ResponseErrorEnum valueOf(String name) => _$subscriptionStatus500ResponseErrorEnumValueOf(name);
}
