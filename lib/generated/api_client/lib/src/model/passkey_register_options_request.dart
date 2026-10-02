//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'passkey_register_options_request.g.dart';

/// PasskeyRegisterOptionsRequest
///
/// Properties:
/// * [name]
/// * [password]
@BuiltValue()
abstract class PasskeyRegisterOptionsRequest implements Built<PasskeyRegisterOptionsRequest, PasskeyRegisterOptionsRequestBuilder> {
  @BuiltValueField(wireName: r'name')
  String get name;

  @BuiltValueField(wireName: r'password')
  String get password;

  PasskeyRegisterOptionsRequest._();

  factory PasskeyRegisterOptionsRequest([void updates(PasskeyRegisterOptionsRequestBuilder b)]) = _$PasskeyRegisterOptionsRequest;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(PasskeyRegisterOptionsRequestBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<PasskeyRegisterOptionsRequest> get serializer => _$PasskeyRegisterOptionsRequestSerializer();
}

class _$PasskeyRegisterOptionsRequestSerializer implements PrimitiveSerializer<PasskeyRegisterOptionsRequest> {
  @override
  final Iterable<Type> types = const [PasskeyRegisterOptionsRequest, _$PasskeyRegisterOptionsRequest];

  @override
  final String wireName = r'PasskeyRegisterOptionsRequest';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    PasskeyRegisterOptionsRequest object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    yield r'name';
    yield serializers.serialize(
      object.name,
      specifiedType: const FullType(String),
    );
    yield r'password';
    yield serializers.serialize(
      object.password,
      specifiedType: const FullType(String),
    );
  }

  @override
  Object serialize(
    Serializers serializers,
    PasskeyRegisterOptionsRequest object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required PasskeyRegisterOptionsRequestBuilder result,
    required List<Object?> unhandled,
  }) {
    for (var i = 0; i < serializedList.length; i += 2) {
      final key = serializedList[i] as String;
      final value = serializedList[i + 1];
      switch (key) {
        case r'name':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.name = valueDes;
          break;
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
  PasskeyRegisterOptionsRequest deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = PasskeyRegisterOptionsRequestBuilder();
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
