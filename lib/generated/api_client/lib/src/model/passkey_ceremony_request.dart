//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:lythaus_api_client/src/model/passkey_ceremony_request_credential.dart';
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'passkey_ceremony_request.g.dart';

/// PasskeyCeremonyRequest
///
/// Properties:
/// * [challengeId]
/// * [credential]
@BuiltValue()
abstract class PasskeyCeremonyRequest implements Built<PasskeyCeremonyRequest, PasskeyCeremonyRequestBuilder> {
  @BuiltValueField(wireName: r'challengeId')
  String get challengeId;

  @BuiltValueField(wireName: r'credential')
  PasskeyCeremonyRequestCredential get credential;

  PasskeyCeremonyRequest._();

  factory PasskeyCeremonyRequest([void updates(PasskeyCeremonyRequestBuilder b)]) = _$PasskeyCeremonyRequest;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(PasskeyCeremonyRequestBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<PasskeyCeremonyRequest> get serializer => _$PasskeyCeremonyRequestSerializer();
}

class _$PasskeyCeremonyRequestSerializer implements PrimitiveSerializer<PasskeyCeremonyRequest> {
  @override
  final Iterable<Type> types = const [PasskeyCeremonyRequest, _$PasskeyCeremonyRequest];

  @override
  final String wireName = r'PasskeyCeremonyRequest';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    PasskeyCeremonyRequest object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    yield r'challengeId';
    yield serializers.serialize(
      object.challengeId,
      specifiedType: const FullType(String),
    );
    yield r'credential';
    yield serializers.serialize(
      object.credential,
      specifiedType: const FullType(PasskeyCeremonyRequestCredential),
    );
  }

  @override
  Object serialize(
    Serializers serializers,
    PasskeyCeremonyRequest object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required PasskeyCeremonyRequestBuilder result,
    required List<Object?> unhandled,
  }) {
    for (var i = 0; i < serializedList.length; i += 2) {
      final key = serializedList[i] as String;
      final value = serializedList[i + 1];
      switch (key) {
        case r'challengeId':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.challengeId = valueDes;
          break;
        case r'credential':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(PasskeyCeremonyRequestCredential),
          ) as PasskeyCeremonyRequestCredential;
          result.credential.replace(valueDes);
          break;
        default:
          unhandled.add(key);
          unhandled.add(value);
          break;
      }
    }
  }

  @override
  PasskeyCeremonyRequest deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = PasskeyCeremonyRequestBuilder();
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
