//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'passkey_rename_request.g.dart';

/// PasskeyRenameRequest
///
/// Properties:
/// * [name]
@BuiltValue()
abstract class PasskeyRenameRequest implements Built<PasskeyRenameRequest, PasskeyRenameRequestBuilder> {
  @BuiltValueField(wireName: r'name')
  String get name;

  PasskeyRenameRequest._();

  factory PasskeyRenameRequest([void updates(PasskeyRenameRequestBuilder b)]) = _$PasskeyRenameRequest;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(PasskeyRenameRequestBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<PasskeyRenameRequest> get serializer => _$PasskeyRenameRequestSerializer();
}

class _$PasskeyRenameRequestSerializer implements PrimitiveSerializer<PasskeyRenameRequest> {
  @override
  final Iterable<Type> types = const [PasskeyRenameRequest, _$PasskeyRenameRequest];

  @override
  final String wireName = r'PasskeyRenameRequest';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    PasskeyRenameRequest object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    yield r'name';
    yield serializers.serialize(
      object.name,
      specifiedType: const FullType(String),
    );
  }

  @override
  Object serialize(
    Serializers serializers,
    PasskeyRenameRequest object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required PasskeyRenameRequestBuilder result,
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
        default:
          unhandled.add(key);
          unhandled.add(value);
          break;
      }
    }
  }

  @override
  PasskeyRenameRequest deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = PasskeyRenameRequestBuilder();
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
