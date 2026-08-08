//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:lythaus_api_client/src/model/privacy_request.dart';
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'privacy_request_status_response.g.dart';

/// PrivacyRequestStatusResponse
///
/// Properties:
/// * [request]
@BuiltValue()
abstract class PrivacyRequestStatusResponse implements Built<PrivacyRequestStatusResponse, PrivacyRequestStatusResponseBuilder> {
  @BuiltValueField(wireName: r'request')
  PrivacyRequest? get request;

  PrivacyRequestStatusResponse._();

  factory PrivacyRequestStatusResponse([void updates(PrivacyRequestStatusResponseBuilder b)]) = _$PrivacyRequestStatusResponse;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(PrivacyRequestStatusResponseBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<PrivacyRequestStatusResponse> get serializer => _$PrivacyRequestStatusResponseSerializer();
}

class _$PrivacyRequestStatusResponseSerializer implements PrimitiveSerializer<PrivacyRequestStatusResponse> {
  @override
  final Iterable<Type> types = const [PrivacyRequestStatusResponse, _$PrivacyRequestStatusResponse];

  @override
  final String wireName = r'PrivacyRequestStatusResponse';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    PrivacyRequestStatusResponse object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    yield r'request';
    yield object.request == null ? null : serializers.serialize(
      object.request,
      specifiedType: const FullType.nullable(PrivacyRequest),
    );
  }

  @override
  Object serialize(
    Serializers serializers,
    PrivacyRequestStatusResponse object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required PrivacyRequestStatusResponseBuilder result,
    required List<Object?> unhandled,
  }) {
    for (var i = 0; i < serializedList.length; i += 2) {
      final key = serializedList[i] as String;
      final value = serializedList[i + 1];
      switch (key) {
        case r'request':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType.nullable(PrivacyRequest),
          ) as PrivacyRequest?;
          if (valueDes == null) continue;
          result.request = valueDes;
          break;
        default:
          unhandled.add(key);
          unhandled.add(value);
          break;
      }
    }
  }

  @override
  PrivacyRequestStatusResponse deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = PrivacyRequestStatusResponseBuilder();
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
