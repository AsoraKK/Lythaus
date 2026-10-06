//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'passkey_revoke_request.g.dart';

/// PasskeyRevokeRequest
///
/// Properties:
/// * [password]
@BuiltValue()
abstract class PasskeyRevokeRequest implements Built<PasskeyRevokeRequest, PasskeyRevokeRequestBuilder> {
  @BuiltValueField(wireName: r'password')
  String get password;

  PasskeyRevokeRequest._();

  factory PasskeyRevokeRequest([void updates(PasskeyRevokeRequestBuilder b)]) = _$PasskeyRevokeRequest;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(PasskeyRevokeRequestBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<PasskeyRevokeRequest> get serializer => _$PasskeyRevokeRequestSerializer();
}

class _$PasskeyRevokeRequestSerializer implements PrimitiveSerializer<PasskeyRevokeRequest> {
  @override
  final Iterable<Type> types = const [PasskeyRevokeRequest, _$PasskeyRevokeRequest];

  @override
  final String wireName = r'PasskeyRevokeRequest';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    PasskeyRevokeRequest object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    yield r'password';
    yield serializers.serialize(
      object.password,
      specifiedType: const FullType(String),
    );
  }

  @override
  Object serialize(
    Serializers serializers,
    PasskeyRevokeRequest object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required PasskeyRevokeRequestBuilder result,
    required List<Object?> unhandled,
  }) {
    for (var i = 0; i < serializedList.length; i += 2) {
      final key = serializedList[i] as String;
      final value = serializedList[i + 1];
      switch (key) {
        case r'password':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.password = valueDes;
          break;
        default:
          unhandled.add(key);
          unhandled.add(value);
          break;
      }
    }
  }

  @override
  PasskeyRevokeRequest deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = PasskeyRevokeRequestBuilder();
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
