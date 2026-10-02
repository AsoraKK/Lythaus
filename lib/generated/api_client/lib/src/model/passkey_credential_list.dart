//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:lythaus_api_client/src/model/passkey_credential_list_credentials_inner.dart';
import 'package:built_collection/built_collection.dart';
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'passkey_credential_list.g.dart';

/// PasskeyCredentialList
///
/// Properties:
/// * [credentials]
@BuiltValue()
abstract class PasskeyCredentialList implements Built<PasskeyCredentialList, PasskeyCredentialListBuilder> {
  @BuiltValueField(wireName: r'credentials')
  BuiltList<PasskeyCredentialListCredentialsInner> get credentials;

  PasskeyCredentialList._();

  factory PasskeyCredentialList([void updates(PasskeyCredentialListBuilder b)]) = _$PasskeyCredentialList;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(PasskeyCredentialListBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<PasskeyCredentialList> get serializer => _$PasskeyCredentialListSerializer();
}

class _$PasskeyCredentialListSerializer implements PrimitiveSerializer<PasskeyCredentialList> {
  @override
  final Iterable<Type> types = const [PasskeyCredentialList, _$PasskeyCredentialList];

  @override
  final String wireName = r'PasskeyCredentialList';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    PasskeyCredentialList object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    yield r'credentials';
    yield serializers.serialize(
      object.credentials,
      specifiedType: const FullType(BuiltList, [FullType(PasskeyCredentialListCredentialsInner)]),
    );
  }

  @override
  Object serialize(
    Serializers serializers,
    PasskeyCredentialList object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required PasskeyCredentialListBuilder result,
    required List<Object?> unhandled,
  }) {
    for (var i = 0; i < serializedList.length; i += 2) {
      final key = serializedList[i] as String;
      final value = serializedList[i + 1];
      switch (key) {
        case r'credentials':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(BuiltList, [FullType(PasskeyCredentialListCredentialsInner)]),
          ) as BuiltList<PasskeyCredentialListCredentialsInner>;
          result.credentials.replace(valueDes);
          break;
        default:
          unhandled.add(key);
          unhandled.add(value);
          break;
      }
    }
  }

  @override
  PasskeyCredentialList deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = PasskeyCredentialListBuilder();
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
