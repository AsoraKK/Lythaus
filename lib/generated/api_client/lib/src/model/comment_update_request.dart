//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'comment_update_request.g.dart';

/// CommentUpdateRequest
///
/// Properties:
/// * [body]
@BuiltValue()
abstract class CommentUpdateRequest implements Built<CommentUpdateRequest, CommentUpdateRequestBuilder> {
  @BuiltValueField(wireName: r'body')
  String get body;

  CommentUpdateRequest._();

  factory CommentUpdateRequest([void updates(CommentUpdateRequestBuilder b)]) = _$CommentUpdateRequest;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(CommentUpdateRequestBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<CommentUpdateRequest> get serializer => _$CommentUpdateRequestSerializer();
}

class _$CommentUpdateRequestSerializer implements PrimitiveSerializer<CommentUpdateRequest> {
  @override
  final Iterable<Type> types = const [CommentUpdateRequest, _$CommentUpdateRequest];

  @override
  final String wireName = r'CommentUpdateRequest';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    CommentUpdateRequest object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    yield r'body';
    yield serializers.serialize(
      object.body,
      specifiedType: const FullType(String),
    );
  }

  @override
  Object serialize(
    Serializers serializers,
    CommentUpdateRequest object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required CommentUpdateRequestBuilder result,
    required List<Object?> unhandled,
  }) {
    for (var i = 0; i < serializedList.length; i += 2) {
      final key = serializedList[i] as String;
      final value = serializedList[i + 1];
      switch (key) {
        case r'body':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.body = valueDes;
          break;
        default:
          unhandled.add(key);
          unhandled.add(value);
          break;
      }
    }
  }

  @override
  CommentUpdateRequest deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = CommentUpdateRequestBuilder();
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
