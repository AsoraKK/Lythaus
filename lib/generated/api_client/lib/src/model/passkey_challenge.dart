//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:built_collection/built_collection.dart';
import 'package:built_value/json_object.dart';
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'passkey_challenge.g.dart';

/// PasskeyChallenge
///
/// Properties:
/// * [challengeId]
/// * [options] - Opaque SimpleWebAuthn registration or authentication options JSON, including its generated challenge. Pass this complete object to the pinned browser library.
@BuiltValue()
abstract class PasskeyChallenge implements Built<PasskeyChallenge, PasskeyChallengeBuilder> {
  @BuiltValueField(wireName: r'challengeId')
  String get challengeId;

  /// Opaque SimpleWebAuthn registration or authentication options JSON, including its generated challenge. Pass this complete object to the pinned browser library.
  @BuiltValueField(wireName: r'options')
  BuiltMap<String, JsonObject?> get options;

  PasskeyChallenge._();

  factory PasskeyChallenge([void updates(PasskeyChallengeBuilder b)]) = _$PasskeyChallenge;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(PasskeyChallengeBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<PasskeyChallenge> get serializer => _$PasskeyChallengeSerializer();
}

class _$PasskeyChallengeSerializer implements PrimitiveSerializer<PasskeyChallenge> {
  @override
  final Iterable<Type> types = const [PasskeyChallenge, _$PasskeyChallenge];

  @override
  final String wireName = r'PasskeyChallenge';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    PasskeyChallenge object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    yield r'challengeId';
    yield serializers.serialize(
      object.challengeId,
      specifiedType: const FullType(String),
    );
    yield r'options';
    yield serializers.serialize(
      object.options,
      specifiedType: const FullType(BuiltMap, [FullType(String), FullType.nullable(JsonObject)]),
    );
  }

  @override
  Object serialize(
    Serializers serializers,
    PasskeyChallenge object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required PasskeyChallengeBuilder result,
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
        case r'options':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(BuiltMap, [FullType(String), FullType.nullable(JsonObject)]),
          ) as BuiltMap<String, JsonObject?>;
          result.options.replace(valueDes);
          break;
        default:
          unhandled.add(key);
          unhandled.add(value);
          break;
      }
    }
  }

  @override
  PasskeyChallenge deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = PasskeyChallengeBuilder();
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
