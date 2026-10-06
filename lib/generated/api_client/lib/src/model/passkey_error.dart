//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'passkey_error.g.dart';

/// PasskeyError
///
/// Properties:
/// * [error]
/// * [correlationId]
@BuiltValue()
abstract class PasskeyError implements Built<PasskeyError, PasskeyErrorBuilder> {
  @BuiltValueField(wireName: r'error')
  String get error;

  @BuiltValueField(wireName: r'correlationId')
  String get correlationId;

  PasskeyError._();

  factory PasskeyError([void updates(PasskeyErrorBuilder b)]) = _$PasskeyError;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(PasskeyErrorBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<PasskeyError> get serializer => _$PasskeyErrorSerializer();
}

class _$PasskeyErrorSerializer implements PrimitiveSerializer<PasskeyError> {
  @override
  final Iterable<Type> types = const [PasskeyError, _$PasskeyError];

  @override
  final String wireName = r'PasskeyError';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    PasskeyError object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    yield r'error';
    yield serializers.serialize(
      object.error,
      specifiedType: const FullType(String),
    );
    yield r'correlationId';
    yield serializers.serialize(
      object.correlationId,
      specifiedType: const FullType(String),
    );
  }

  @override
  Object serialize(
    Serializers serializers,
    PasskeyError object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required PasskeyErrorBuilder result,
    required List<Object?> unhandled,
  }) {
    for (var i = 0; i < serializedList.length; i += 2) {
      final key = serializedList[i] as String;
      final value = serializedList[i + 1];
      switch (key) {
        case r'error':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.error = valueDes;
          break;
        case r'correlationId':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.correlationId = valueDes;
          break;
        default:
          unhandled.add(key);
          unhandled.add(value);
          break;
      }
    }
  }

  @override
  PasskeyError deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = PasskeyErrorBuilder();
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
