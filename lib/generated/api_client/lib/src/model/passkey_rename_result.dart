//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'passkey_rename_result.g.dart';

/// PasskeyRenameResult
///
/// Properties:
/// * [id]
/// * [revoked]
@BuiltValue()
abstract class PasskeyRenameResult implements Built<PasskeyRenameResult, PasskeyRenameResultBuilder> {
  @BuiltValueField(wireName: r'id')
  String get id;

  @BuiltValueField(wireName: r'revoked')
  bool get revoked;

  PasskeyRenameResult._();

  factory PasskeyRenameResult([void updates(PasskeyRenameResultBuilder b)]) = _$PasskeyRenameResult;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(PasskeyRenameResultBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<PasskeyRenameResult> get serializer => _$PasskeyRenameResultSerializer();
}

class _$PasskeyRenameResultSerializer implements PrimitiveSerializer<PasskeyRenameResult> {
  @override
  final Iterable<Type> types = const [PasskeyRenameResult, _$PasskeyRenameResult];

  @override
  final String wireName = r'PasskeyRenameResult';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    PasskeyRenameResult object, {
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
  }

  @override
  Object serialize(
    Serializers serializers,
    PasskeyRenameResult object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required PasskeyRenameResultBuilder result,
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
        default:
          unhandled.add(key);
          unhandled.add(value);
          break;
      }
    }
  }

  @override
  PasskeyRenameResult deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = PasskeyRenameResultBuilder();
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
