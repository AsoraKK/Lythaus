//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:built_collection/built_collection.dart';
import 'package:lythaus_api_client/src/model/legacy_create_post_response_post.dart';
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'legacy_create_post_response.g.dart';

/// LegacyCreatePostResponse
///
/// Properties:
/// * [status]
/// * [post]
@BuiltValue()
abstract class LegacyCreatePostResponse implements Built<LegacyCreatePostResponse, LegacyCreatePostResponseBuilder> {
  @BuiltValueField(wireName: r'status')
  LegacyCreatePostResponseStatusEnum get status;
  // enum statusEnum {  success,  };

  @BuiltValueField(wireName: r'post')
  LegacyCreatePostResponsePost get post;

  LegacyCreatePostResponse._();

  factory LegacyCreatePostResponse([void updates(LegacyCreatePostResponseBuilder b)]) = _$LegacyCreatePostResponse;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(LegacyCreatePostResponseBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<LegacyCreatePostResponse> get serializer => _$LegacyCreatePostResponseSerializer();
}

class _$LegacyCreatePostResponseSerializer implements PrimitiveSerializer<LegacyCreatePostResponse> {
  @override
  final Iterable<Type> types = const [LegacyCreatePostResponse, _$LegacyCreatePostResponse];

  @override
  final String wireName = r'LegacyCreatePostResponse';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    LegacyCreatePostResponse object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    yield r'status';
    yield serializers.serialize(
      object.status,
      specifiedType: const FullType(LegacyCreatePostResponseStatusEnum),
    );
    yield r'post';
    yield serializers.serialize(
      object.post,
      specifiedType: const FullType(LegacyCreatePostResponsePost),
    );
  }

  @override
  Object serialize(
    Serializers serializers,
    LegacyCreatePostResponse object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required LegacyCreatePostResponseBuilder result,
    required List<Object?> unhandled,
  }) {
    for (var i = 0; i < serializedList.length; i += 2) {
      final key = serializedList[i] as String;
      final value = serializedList[i + 1];
      switch (key) {
        case r'status':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(LegacyCreatePostResponseStatusEnum),
          ) as LegacyCreatePostResponseStatusEnum;
          result.status = valueDes;
          break;
        case r'post':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(LegacyCreatePostResponsePost),
          ) as LegacyCreatePostResponsePost;
          result.post.replace(valueDes);
          break;
        default:
          unhandled.add(key);
          unhandled.add(value);
          break;
      }
    }
  }

  @override
  LegacyCreatePostResponse deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = LegacyCreatePostResponseBuilder();
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

class LegacyCreatePostResponseStatusEnum extends EnumClass {

  @BuiltValueEnumConst(wireName: r'success')
  static const LegacyCreatePostResponseStatusEnum success = _$legacyCreatePostResponseStatusEnum_success;

  static Serializer<LegacyCreatePostResponseStatusEnum> get serializer => _$legacyCreatePostResponseStatusEnumSerializer;

  const LegacyCreatePostResponseStatusEnum._(String name): super(name);

  static BuiltSet<LegacyCreatePostResponseStatusEnum> get values => _$legacyCreatePostResponseStatusEnumValues;
  static LegacyCreatePostResponseStatusEnum valueOf(String name) => _$legacyCreatePostResponseStatusEnumValueOf(name);
}
