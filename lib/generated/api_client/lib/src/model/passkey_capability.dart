//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'passkey_capability.g.dart';

/// PasskeyCapability
///
/// Properties:
/// * [enabled]
@BuiltValue()
abstract class PasskeyCapability implements Built<PasskeyCapability, PasskeyCapabilityBuilder> {
  @BuiltValueField(wireName: r'enabled')
  bool get enabled;

  PasskeyCapability._();

  factory PasskeyCapability([void updates(PasskeyCapabilityBuilder b)]) = _$PasskeyCapability;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(PasskeyCapabilityBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<PasskeyCapability> get serializer => _$PasskeyCapabilitySerializer();
}

class _$PasskeyCapabilitySerializer implements PrimitiveSerializer<PasskeyCapability> {
  @override
  final Iterable<Type> types = const [PasskeyCapability, _$PasskeyCapability];

  @override
  final String wireName = r'PasskeyCapability';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    PasskeyCapability object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    yield r'enabled';
    yield serializers.serialize(
      object.enabled,
      specifiedType: const FullType(bool),
    );
  }

  @override
  Object serialize(
    Serializers serializers,
    PasskeyCapability object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required PasskeyCapabilityBuilder result,
    required List<Object?> unhandled,
  }) {
    for (var i = 0; i < serializedList.length; i += 2) {
      final key = serializedList[i] as String;
      final value = serializedList[i + 1];
      switch (key) {
        case r'enabled':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(bool),
          ) as bool;
          result.enabled = valueDes;
          break;
        default:
          unhandled.add(key);
          unhandled.add(value);
          break;
      }
    }
  }

  @override
  PasskeyCapability deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = PasskeyCapabilityBuilder();
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
