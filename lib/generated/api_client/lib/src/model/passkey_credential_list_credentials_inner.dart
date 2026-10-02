//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:built_collection/built_collection.dart';
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'passkey_credential_list_credentials_inner.g.dart';

/// PasskeyCredentialListCredentialsInner
///
/// Properties:
/// * [id]
/// * [name]
/// * [deviceType]
/// * [backedUp]
/// * [createdAt]
/// * [lastUsedAt]
/// * [lastVerifiedAt]
@BuiltValue()
abstract class PasskeyCredentialListCredentialsInner implements Built<PasskeyCredentialListCredentialsInner, PasskeyCredentialListCredentialsInnerBuilder> {
  @BuiltValueField(wireName: r'id')
  String get id;

  @BuiltValueField(wireName: r'name')
  String get name;

  @BuiltValueField(wireName: r'deviceType')
  PasskeyCredentialListCredentialsInnerDeviceTypeEnum get deviceType;
  // enum deviceTypeEnum {  singleDevice,  multiDevice,  };

  @BuiltValueField(wireName: r'backedUp')
  bool get backedUp;

  @BuiltValueField(wireName: r'createdAt')
  DateTime get createdAt;

  @BuiltValueField(wireName: r'lastUsedAt')
  DateTime? get lastUsedAt;

  @BuiltValueField(wireName: r'lastVerifiedAt')
  DateTime? get lastVerifiedAt;

  PasskeyCredentialListCredentialsInner._();

  factory PasskeyCredentialListCredentialsInner([void updates(PasskeyCredentialListCredentialsInnerBuilder b)]) = _$PasskeyCredentialListCredentialsInner;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(PasskeyCredentialListCredentialsInnerBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<PasskeyCredentialListCredentialsInner> get serializer => _$PasskeyCredentialListCredentialsInnerSerializer();
}

class _$PasskeyCredentialListCredentialsInnerSerializer implements PrimitiveSerializer<PasskeyCredentialListCredentialsInner> {
  @override
  final Iterable<Type> types = const [PasskeyCredentialListCredentialsInner, _$PasskeyCredentialListCredentialsInner];

  @override
  final String wireName = r'PasskeyCredentialListCredentialsInner';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    PasskeyCredentialListCredentialsInner object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    yield r'id';
    yield serializers.serialize(
      object.id,
      specifiedType: const FullType(String),
    );
    yield r'name';
    yield serializers.serialize(
      object.name,
      specifiedType: const FullType(String),
    );
    yield r'deviceType';
    yield serializers.serialize(
      object.deviceType,
      specifiedType: const FullType(PasskeyCredentialListCredentialsInnerDeviceTypeEnum),
    );
    yield r'backedUp';
    yield serializers.serialize(
      object.backedUp,
      specifiedType: const FullType(bool),
    );
    yield r'createdAt';
    yield serializers.serialize(
      object.createdAt,
      specifiedType: const FullType(DateTime),
    );
    yield r'lastUsedAt';
    yield object.lastUsedAt == null ? null : serializers.serialize(
      object.lastUsedAt,
      specifiedType: const FullType.nullable(DateTime),
    );
    yield r'lastVerifiedAt';
    yield object.lastVerifiedAt == null ? null : serializers.serialize(
      object.lastVerifiedAt,
      specifiedType: const FullType.nullable(DateTime),
    );
  }

  @override
  Object serialize(
    Serializers serializers,
    PasskeyCredentialListCredentialsInner object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required PasskeyCredentialListCredentialsInnerBuilder result,
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
        case r'name':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.name = valueDes;
          break;
        case r'deviceType':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(PasskeyCredentialListCredentialsInnerDeviceTypeEnum),
          ) as PasskeyCredentialListCredentialsInnerDeviceTypeEnum;
          result.deviceType = valueDes;
          break;
        case r'backedUp':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(bool),
          ) as bool;
          result.backedUp = valueDes;
          break;
        case r'createdAt':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(DateTime),
          ) as DateTime;
          result.createdAt = valueDes;
          break;
        case r'lastUsedAt':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType.nullable(DateTime),
          ) as DateTime?;
          if (valueDes == null) continue;
          result.lastUsedAt = valueDes;
          break;
        case r'lastVerifiedAt':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType.nullable(DateTime),
          ) as DateTime?;
          if (valueDes == null) continue;
          result.lastVerifiedAt = valueDes;
          break;
        default:
          unhandled.add(key);
          unhandled.add(value);
          break;
      }
    }
  }

  @override
  PasskeyCredentialListCredentialsInner deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = PasskeyCredentialListCredentialsInnerBuilder();
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

class PasskeyCredentialListCredentialsInnerDeviceTypeEnum extends EnumClass {

  @BuiltValueEnumConst(wireName: r'singleDevice')
  static const PasskeyCredentialListCredentialsInnerDeviceTypeEnum singleDevice = _$passkeyCredentialListCredentialsInnerDeviceTypeEnum_singleDevice;
  @BuiltValueEnumConst(wireName: r'multiDevice')
  static const PasskeyCredentialListCredentialsInnerDeviceTypeEnum multiDevice = _$passkeyCredentialListCredentialsInnerDeviceTypeEnum_multiDevice;

  static Serializer<PasskeyCredentialListCredentialsInnerDeviceTypeEnum> get serializer => _$passkeyCredentialListCredentialsInnerDeviceTypeEnumSerializer;

  const PasskeyCredentialListCredentialsInnerDeviceTypeEnum._(String name): super(name);

  static BuiltSet<PasskeyCredentialListCredentialsInnerDeviceTypeEnum> get values => _$passkeyCredentialListCredentialsInnerDeviceTypeEnumValues;
  static PasskeyCredentialListCredentialsInnerDeviceTypeEnum valueOf(String name) => _$passkeyCredentialListCredentialsInnerDeviceTypeEnumValueOf(name);
}
