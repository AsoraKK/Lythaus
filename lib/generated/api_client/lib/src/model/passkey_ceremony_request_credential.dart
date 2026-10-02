//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:built_collection/built_collection.dart';
import 'package:built_value/json_object.dart';
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'passkey_ceremony_request_credential.g.dart';

/// PasskeyCeremonyRequestCredential
///
/// Properties:
/// * [id]
/// * [rawId]
/// * [type]
/// * [response]
/// * [clientExtensionResults]
/// * [authenticatorAttachment]
@BuiltValue()
abstract class PasskeyCeremonyRequestCredential implements Built<PasskeyCeremonyRequestCredential, PasskeyCeremonyRequestCredentialBuilder> {
  @BuiltValueField(wireName: r'id')
  String get id;

  @BuiltValueField(wireName: r'rawId')
  String get rawId;

  @BuiltValueField(wireName: r'type')
  PasskeyCeremonyRequestCredentialTypeEnum get type;
  // enum typeEnum {  public-key,  };

  @BuiltValueField(wireName: r'response')
  BuiltMap<String, JsonObject?> get response;

  @BuiltValueField(wireName: r'clientExtensionResults')
  BuiltMap<String, JsonObject?> get clientExtensionResults;

  @BuiltValueField(wireName: r'authenticatorAttachment')
  PasskeyCeremonyRequestCredentialAuthenticatorAttachmentEnum? get authenticatorAttachment;
  // enum authenticatorAttachmentEnum {  platform,  cross-platform,  };

  PasskeyCeremonyRequestCredential._();

  factory PasskeyCeremonyRequestCredential([void updates(PasskeyCeremonyRequestCredentialBuilder b)]) = _$PasskeyCeremonyRequestCredential;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(PasskeyCeremonyRequestCredentialBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<PasskeyCeremonyRequestCredential> get serializer => _$PasskeyCeremonyRequestCredentialSerializer();
}

class _$PasskeyCeremonyRequestCredentialSerializer implements PrimitiveSerializer<PasskeyCeremonyRequestCredential> {
  @override
  final Iterable<Type> types = const [PasskeyCeremonyRequestCredential, _$PasskeyCeremonyRequestCredential];

  @override
  final String wireName = r'PasskeyCeremonyRequestCredential';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    PasskeyCeremonyRequestCredential object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    yield r'id';
    yield serializers.serialize(
      object.id,
      specifiedType: const FullType(String),
    );
    yield r'rawId';
    yield serializers.serialize(
      object.rawId,
      specifiedType: const FullType(String),
    );
    yield r'type';
    yield serializers.serialize(
      object.type,
      specifiedType: const FullType(PasskeyCeremonyRequestCredentialTypeEnum),
    );
    yield r'response';
    yield serializers.serialize(
      object.response,
      specifiedType: const FullType(BuiltMap, [FullType(String), FullType.nullable(JsonObject)]),
    );
    yield r'clientExtensionResults';
    yield serializers.serialize(
      object.clientExtensionResults,
      specifiedType: const FullType(BuiltMap, [FullType(String), FullType.nullable(JsonObject)]),
    );
    if (object.authenticatorAttachment != null) {
      yield r'authenticatorAttachment';
      yield serializers.serialize(
        object.authenticatorAttachment,
        specifiedType: const FullType(PasskeyCeremonyRequestCredentialAuthenticatorAttachmentEnum),
      );
    }
  }

  @override
  Object serialize(
    Serializers serializers,
    PasskeyCeremonyRequestCredential object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required PasskeyCeremonyRequestCredentialBuilder result,
    required List<Object?> unhandled,
  }) {
    for (var i = 0; i < serializedList.length; i += 2) {
      final key = serializedList[i] as String;
      final value = serializedList[i + 1];
      switch (key) {
        case r'id':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.id = valueDes;
          break;
        case r'rawId':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.rawId = valueDes;
          break;
        case r'type':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(PasskeyCeremonyRequestCredentialTypeEnum),
          ) as PasskeyCeremonyRequestCredentialTypeEnum;
          result.type = valueDes;
          break;
        case r'response':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(BuiltMap, [FullType(String), FullType.nullable(JsonObject)]),
          ) as BuiltMap<String, JsonObject?>;
          result.response.replace(valueDes);
          break;
        case r'clientExtensionResults':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(BuiltMap, [FullType(String), FullType.nullable(JsonObject)]),
          ) as BuiltMap<String, JsonObject?>;
          result.clientExtensionResults.replace(valueDes);
          break;
        case r'authenticatorAttachment':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(PasskeyCeremonyRequestCredentialAuthenticatorAttachmentEnum),
          ) as PasskeyCeremonyRequestCredentialAuthenticatorAttachmentEnum;
          result.authenticatorAttachment = valueDes;
          break;
        default:
          unhandled.add(key);
          unhandled.add(value);
          break;
      }
    }
  }

  @override
  PasskeyCeremonyRequestCredential deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = PasskeyCeremonyRequestCredentialBuilder();
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

class PasskeyCeremonyRequestCredentialTypeEnum extends EnumClass {

  @BuiltValueEnumConst(wireName: r'public-key')
  static const PasskeyCeremonyRequestCredentialTypeEnum publicKey = _$passkeyCeremonyRequestCredentialTypeEnum_publicKey;

  static Serializer<PasskeyCeremonyRequestCredentialTypeEnum> get serializer => _$passkeyCeremonyRequestCredentialTypeEnumSerializer;

  const PasskeyCeremonyRequestCredentialTypeEnum._(String name): super(name);

  static BuiltSet<PasskeyCeremonyRequestCredentialTypeEnum> get values => _$passkeyCeremonyRequestCredentialTypeEnumValues;
  static PasskeyCeremonyRequestCredentialTypeEnum valueOf(String name) => _$passkeyCeremonyRequestCredentialTypeEnumValueOf(name);
}

class PasskeyCeremonyRequestCredentialAuthenticatorAttachmentEnum extends EnumClass {

  @BuiltValueEnumConst(wireName: r'platform')
  static const PasskeyCeremonyRequestCredentialAuthenticatorAttachmentEnum platform = _$passkeyCeremonyRequestCredentialAuthenticatorAttachmentEnum_platform;
  @BuiltValueEnumConst(wireName: r'cross-platform')
  static const PasskeyCeremonyRequestCredentialAuthenticatorAttachmentEnum crossPlatform = _$passkeyCeremonyRequestCredentialAuthenticatorAttachmentEnum_crossPlatform;

  static Serializer<PasskeyCeremonyRequestCredentialAuthenticatorAttachmentEnum> get serializer => _$passkeyCeremonyRequestCredentialAuthenticatorAttachmentEnumSerializer;

  const PasskeyCeremonyRequestCredentialAuthenticatorAttachmentEnum._(String name): super(name);

  static BuiltSet<PasskeyCeremonyRequestCredentialAuthenticatorAttachmentEnum> get values => _$passkeyCeremonyRequestCredentialAuthenticatorAttachmentEnumValues;
  static PasskeyCeremonyRequestCredentialAuthenticatorAttachmentEnum valueOf(String name) => _$passkeyCeremonyRequestCredentialAuthenticatorAttachmentEnumValueOf(name);
}
