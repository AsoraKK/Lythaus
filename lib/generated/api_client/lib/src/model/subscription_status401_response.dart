//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'subscription_status401_response.g.dart';

/// SubscriptionStatus401Response
///
/// Properties:
/// * [error]
/// * [correlationId]
@BuiltValue()
abstract class SubscriptionStatus401Response implements Built<SubscriptionStatus401Response, SubscriptionStatus401ResponseBuilder> {
  @BuiltValueField(wireName: r'error')
  String get error;

  @BuiltValueField(wireName: r'correlationId')
  String get correlationId;

  SubscriptionStatus401Response._();

  factory SubscriptionStatus401Response([void updates(SubscriptionStatus401ResponseBuilder b)]) = _$SubscriptionStatus401Response;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(SubscriptionStatus401ResponseBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<SubscriptionStatus401Response> get serializer => _$SubscriptionStatus401ResponseSerializer();
}

class _$SubscriptionStatus401ResponseSerializer implements PrimitiveSerializer<SubscriptionStatus401Response> {
  @override
  final Iterable<Type> types = const [SubscriptionStatus401Response, _$SubscriptionStatus401Response];

  @override
  final String wireName = r'SubscriptionStatus401Response';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    SubscriptionStatus401Response object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    yield r'error';
    yield serializers.serialize(
      object.error,
      specifiedType: const FullType(String),
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
    SubscriptionStatus401Response object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required SubscriptionStatus401ResponseBuilder result,
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
  SubscriptionStatus401Response deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = SubscriptionStatus401ResponseBuilder();
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
