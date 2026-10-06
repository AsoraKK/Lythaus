//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:built_collection/built_collection.dart';
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'passkey_session.g.dart';

/// PasskeySession
///
/// Properties:
/// * [accessToken]
/// * [expiresIn]
/// * [tokenType]
/// * [sessionTransport]
@BuiltValue()
abstract class PasskeySession implements Built<PasskeySession, PasskeySessionBuilder> {
  @BuiltValueField(wireName: r'accessToken')
  String get accessToken;

  @BuiltValueField(wireName: r'expiresIn')
  PasskeySessionExpiresInEnum get expiresIn;
  // enum expiresInEnum {  900,  };

  @BuiltValueField(wireName: r'tokenType')
  PasskeySessionTokenTypeEnum get tokenType;
  // enum tokenTypeEnum {  Bearer,  };

  @BuiltValueField(wireName: r'sessionTransport')
  PasskeySessionSessionTransportEnum get sessionTransport;
  // enum sessionTransportEnum {  cookie-v1,  };

  PasskeySession._();

  factory PasskeySession([void updates(PasskeySessionBuilder b)]) = _$PasskeySession;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(PasskeySessionBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<PasskeySession> get serializer => _$PasskeySessionSerializer();
}

class _$PasskeySessionSerializer implements PrimitiveSerializer<PasskeySession> {
  @override
  final Iterable<Type> types = const [PasskeySession, _$PasskeySession];

  @override
  final String wireName = r'PasskeySession';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    PasskeySession object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    yield r'accessToken';
    yield serializers.serialize(
      object.accessToken,
      specifiedType: const FullType(String),
    );
    yield r'expiresIn';
    yield serializers.serialize(
      object.expiresIn,
      specifiedType: const FullType(PasskeySessionExpiresInEnum),
    );
    yield r'tokenType';
    yield serializers.serialize(
      object.tokenType,
      specifiedType: const FullType(PasskeySessionTokenTypeEnum),
    );
    yield r'sessionTransport';
    yield serializers.serialize(
      object.sessionTransport,
      specifiedType: const FullType(PasskeySessionSessionTransportEnum),
    );
  }

  @override
  Object serialize(
    Serializers serializers,
    PasskeySession object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required PasskeySessionBuilder result,
    required List<Object?> unhandled,
  }) {
    for (var i = 0; i < serializedList.length; i += 2) {
      final key = serializedList[i] as String;
      final value = serializedList[i + 1];
      switch (key) {
        case r'accessToken':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.accessToken = valueDes;
          break;
        case r'expiresIn':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(PasskeySessionExpiresInEnum),
          ) as PasskeySessionExpiresInEnum;
          result.expiresIn = valueDes;
          break;
        case r'tokenType':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(PasskeySessionTokenTypeEnum),
          ) as PasskeySessionTokenTypeEnum;
          result.tokenType = valueDes;
          break;
        case r'sessionTransport':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(PasskeySessionSessionTransportEnum),
          ) as PasskeySessionSessionTransportEnum;
          result.sessionTransport = valueDes;
          break;
        default:
          unhandled.add(key);
          unhandled.add(value);
          break;
      }
    }
  }

  @override
  PasskeySession deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = PasskeySessionBuilder();
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

class PasskeySessionExpiresInEnum extends EnumClass {

  @BuiltValueEnumConst(wireNumber: 900)
  static const PasskeySessionExpiresInEnum number900 = _$passkeySessionExpiresInEnum_number900;

  static Serializer<PasskeySessionExpiresInEnum> get serializer => _$passkeySessionExpiresInEnumSerializer;

  const PasskeySessionExpiresInEnum._(String name): super(name);

  static BuiltSet<PasskeySessionExpiresInEnum> get values => _$passkeySessionExpiresInEnumValues;
  static PasskeySessionExpiresInEnum valueOf(String name) => _$passkeySessionExpiresInEnumValueOf(name);
}

class PasskeySessionTokenTypeEnum extends EnumClass {

  @BuiltValueEnumConst(wireName: r'Bearer')
  static const PasskeySessionTokenTypeEnum bearer = _$passkeySessionTokenTypeEnum_bearer;

  static Serializer<PasskeySessionTokenTypeEnum> get serializer => _$passkeySessionTokenTypeEnumSerializer;

  const PasskeySessionTokenTypeEnum._(String name): super(name);

  static BuiltSet<PasskeySessionTokenTypeEnum> get values => _$passkeySessionTokenTypeEnumValues;
  static PasskeySessionTokenTypeEnum valueOf(String name) => _$passkeySessionTokenTypeEnumValueOf(name);
}

class PasskeySessionSessionTransportEnum extends EnumClass {

  @BuiltValueEnumConst(wireName: r'cookie-v1')
  static const PasskeySessionSessionTransportEnum cookieV1 = _$passkeySessionSessionTransportEnum_cookieV1;

  static Serializer<PasskeySessionSessionTransportEnum> get serializer => _$passkeySessionSessionTransportEnumSerializer;

  const PasskeySessionSessionTransportEnum._(String name): super(name);

  static BuiltSet<PasskeySessionSessionTransportEnum> get values => _$passkeySessionSessionTransportEnumValues;
  static PasskeySessionSessionTransportEnum valueOf(String name) => _$passkeySessionSessionTransportEnumValueOf(name);
}
