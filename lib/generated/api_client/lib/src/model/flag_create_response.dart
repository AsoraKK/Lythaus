//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'flag_create_response.g.dart';

/// FlagCreateResponse
///
/// Properties:
/// * [flagId]
@BuiltValue()
abstract class FlagCreateResponse implements Built<FlagCreateResponse, FlagCreateResponseBuilder> {
  @BuiltValueField(wireName: r'flagId')
  String get flagId;

  FlagCreateResponse._();

  factory FlagCreateResponse([void updates(FlagCreateResponseBuilder b)]) = _$FlagCreateResponse;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(FlagCreateResponseBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<FlagCreateResponse> get serializer => _$FlagCreateResponseSerializer();
}

class _$FlagCreateResponseSerializer implements PrimitiveSerializer<FlagCreateResponse> {
  @override
  final Iterable<Type> types = const [FlagCreateResponse, _$FlagCreateResponse];

  @override
  final String wireName = r'FlagCreateResponse';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    FlagCreateResponse object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    yield r'flagId';
    yield serializers.serialize(
      object.flagId,
      specifiedType: const FullType(String),
    );
  }

  @override
  Object serialize(
    Serializers serializers,
    FlagCreateResponse object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required FlagCreateResponseBuilder result,
    required List<Object?> unhandled,
  }) {
    for (var i = 0; i < serializedList.length; i += 2) {
      final key = serializedList[i] as String;
      final value = serializedList[i + 1];
      switch (key) {
        case r'flagId':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.flagId = valueDes;
          break;
        default:
          unhandled.add(key);
          unhandled.add(value);
          break;
      }
    }
  }

  @override
  FlagCreateResponse deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = FlagCreateResponseBuilder();
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
