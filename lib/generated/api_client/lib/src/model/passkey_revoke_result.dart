//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:built_collection/built_collection.dart';
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'passkey_revoke_result.g.dart';

/// PasskeyRevokeResult
///
/// Properties:
/// * [id]
/// * [revoked]
/// * [sessionRevocation]
@BuiltValue()
abstract class PasskeyRevokeResult implements Built<PasskeyRevokeResult, PasskeyRevokeResultBuilder> {
  @BuiltValueField(wireName: r'id')
  String get id;

  @BuiltValueField(wireName: r'revoked')
  bool get revoked;

  @BuiltValueField(wireName: r'sessionRevocation')
  PasskeyRevokeResultSessionRevocationEnum get sessionRevocation;
  // enum sessionRevocationEnum {  all,  };

  PasskeyRevokeResult._();

  factory PasskeyRevokeResult([void updates(PasskeyRevokeResultBuilder b)]) = _$PasskeyRevokeResult;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(PasskeyRevokeResultBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<PasskeyRevokeResult> get serializer => _$PasskeyRevokeResultSerializer();
}

class _$PasskeyRevokeResultSerializer implements PrimitiveSerializer<PasskeyRevokeResult> {
  @override
  final Iterable<Type> types = const [PasskeyRevokeResult, _$PasskeyRevokeResult];

  @override
  final String wireName = r'PasskeyRevokeResult';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    PasskeyRevokeResult object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    yield r'id';
    yield serializers.serialize(
      object.id,
      specifiedType: const FullType(String),
    );
    yield r'revoked';
    yield serializers.serialize(
      object.revoked,
      specifiedType: const FullType(bool),
    );
    yield r'sessionRevocation';
    yield serializers.serialize(
      object.sessionRevocation,
      specifiedType: const FullType(PasskeyRevokeResultSessionRevocationEnum),
    );
  }

  @override
  Object serialize(
    Serializers serializers,
    PasskeyRevokeResult object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required PasskeyRevokeResultBuilder result,
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
        case r'revoked':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(bool),
          ) as bool;
          result.revoked = valueDes;
          break;
        case r'sessionRevocation':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(PasskeyRevokeResultSessionRevocationEnum),
          ) as PasskeyRevokeResultSessionRevocationEnum;
          result.sessionRevocation = valueDes;
          break;
        default:
          unhandled.add(key);
          unhandled.add(value);
          break;
      }
    }
  }

  @override
  PasskeyRevokeResult deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = PasskeyRevokeResultBuilder();
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

class PasskeyRevokeResultSessionRevocationEnum extends EnumClass {

  @BuiltValueEnumConst(wireName: r'all')
  static const PasskeyRevokeResultSessionRevocationEnum all = _$passkeyRevokeResultSessionRevocationEnum_all;

  static Serializer<PasskeyRevokeResultSessionRevocationEnum> get serializer => _$passkeyRevokeResultSessionRevocationEnumSerializer;

  const PasskeyRevokeResultSessionRevocationEnum._(String name): super(name);

  static BuiltSet<PasskeyRevokeResultSessionRevocationEnum> get values => _$passkeyRevokeResultSessionRevocationEnumValues;
  static PasskeyRevokeResultSessionRevocationEnum valueOf(String name) => _$passkeyRevokeResultSessionRevocationEnumValueOf(name);
}
