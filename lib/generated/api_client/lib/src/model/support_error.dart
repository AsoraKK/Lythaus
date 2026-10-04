//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'support_error.g.dart';

/// SupportError
///
/// Properties:
/// * [error]
@BuiltValue()
abstract class SupportError implements Built<SupportError, SupportErrorBuilder> {
  @BuiltValueField(wireName: r'error')
  String get error;

  SupportError._();

  factory SupportError([void updates(SupportErrorBuilder b)]) = _$SupportError;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(SupportErrorBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<SupportError> get serializer => _$SupportErrorSerializer();
}

class _$SupportErrorSerializer implements PrimitiveSerializer<SupportError> {
  @override
  final Iterable<Type> types = const [SupportError, _$SupportError];

  @override
  final String wireName = r'SupportError';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    SupportError object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    yield r'error';
    yield serializers.serialize(
      object.error,
      specifiedType: const FullType(String),
    );
  }

  @override
  Object serialize(
    Serializers serializers,
    SupportError object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required SupportErrorBuilder result,
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
        default:
          unhandled.add(key);
          unhandled.add(value);
          break;
      }
    }
  }

  @override
  SupportError deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = SupportErrorBuilder();
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
