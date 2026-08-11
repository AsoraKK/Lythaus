//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'flag_create_request.g.dart';

/// FlagCreateRequest
///
/// Properties:
/// * [contentType]
/// * [contentId]
/// * [reasonCode]
@BuiltValue()
abstract class FlagCreateRequest implements Built<FlagCreateRequest, FlagCreateRequestBuilder> {
  @BuiltValueField(wireName: r'contentType')
  String get contentType;

  @BuiltValueField(wireName: r'contentId')
  String get contentId;

  @BuiltValueField(wireName: r'reasonCode')
  String get reasonCode;

  FlagCreateRequest._();

  factory FlagCreateRequest([void updates(FlagCreateRequestBuilder b)]) = _$FlagCreateRequest;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(FlagCreateRequestBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<FlagCreateRequest> get serializer => _$FlagCreateRequestSerializer();
}

class _$FlagCreateRequestSerializer implements PrimitiveSerializer<FlagCreateRequest> {
  @override
  final Iterable<Type> types = const [FlagCreateRequest, _$FlagCreateRequest];

  @override
  final String wireName = r'FlagCreateRequest';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    FlagCreateRequest object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    yield r'contentType';
    yield serializers.serialize(
      object.contentType,
      specifiedType: const FullType(String),
    );
    yield r'contentId';
    yield serializers.serialize(
      object.contentId,
      specifiedType: const FullType(String),
    );
    yield r'reasonCode';
    yield serializers.serialize(
      object.reasonCode,
      specifiedType: const FullType(String),
    );
  }

  @override
  Object serialize(
    Serializers serializers,
    FlagCreateRequest object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required FlagCreateRequestBuilder result,
    required List<Object?> unhandled,
  }) {
    for (var i = 0; i < serializedList.length; i += 2) {
      final key = serializedList[i] as String;
      final value = serializedList[i + 1];
      switch (key) {
        case r'contentType':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.contentType = valueDes;
          break;
        case r'contentId':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.contentId = valueDes;
          break;
        case r'reasonCode':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.reasonCode = valueDes;
          break;
        default:
          unhandled.add(key);
          unhandled.add(value);
          break;
      }
    }
  }

  @override
  FlagCreateRequest deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = FlagCreateRequestBuilder();
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
