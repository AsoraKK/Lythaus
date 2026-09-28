//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'beta_error.g.dart';

/// BetaError
///
/// Properties:
/// * [error]
@BuiltValue()
abstract class BetaError implements Built<BetaError, BetaErrorBuilder> {
  @BuiltValueField(wireName: r'error')
  String get error;

  BetaError._();

  factory BetaError([void updates(BetaErrorBuilder b)]) = _$BetaError;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(BetaErrorBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<BetaError> get serializer => _$BetaErrorSerializer();
}

class _$BetaErrorSerializer implements PrimitiveSerializer<BetaError> {
  @override
  final Iterable<Type> types = const [BetaError, _$BetaError];

  @override
  final String wireName = r'BetaError';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    BetaError object, {
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
    BetaError object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required BetaErrorBuilder result,
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
  BetaError deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = BetaErrorBuilder();
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
