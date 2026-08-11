//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'comment_delete_response.g.dart';

/// CommentDeleteResponse
///
/// Properties:
/// * [commentId]
/// * [deleted]
@BuiltValue()
abstract class CommentDeleteResponse implements Built<CommentDeleteResponse, CommentDeleteResponseBuilder> {
  @BuiltValueField(wireName: r'commentId')
  String get commentId;

  @BuiltValueField(wireName: r'deleted')
  bool get deleted;

  CommentDeleteResponse._();

  factory CommentDeleteResponse([void updates(CommentDeleteResponseBuilder b)]) = _$CommentDeleteResponse;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(CommentDeleteResponseBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<CommentDeleteResponse> get serializer => _$CommentDeleteResponseSerializer();
}

class _$CommentDeleteResponseSerializer implements PrimitiveSerializer<CommentDeleteResponse> {
  @override
  final Iterable<Type> types = const [CommentDeleteResponse, _$CommentDeleteResponse];

  @override
  final String wireName = r'CommentDeleteResponse';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    CommentDeleteResponse object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    yield r'commentId';
    yield serializers.serialize(
      object.commentId,
      specifiedType: const FullType(String),
    );
    yield r'deleted';
    yield serializers.serialize(
      object.deleted,
      specifiedType: const FullType(bool),
    );
  }

  @override
  Object serialize(
    Serializers serializers,
    CommentDeleteResponse object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required CommentDeleteResponseBuilder result,
    required List<Object?> unhandled,
  }) {
    for (var i = 0; i < serializedList.length; i += 2) {
      final key = serializedList[i] as String;
      final value = serializedList[i + 1];
      switch (key) {
        case r'commentId':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.commentId = valueDes;
          break;
        case r'deleted':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(bool),
          ) as bool;
          result.deleted = valueDes;
          break;
        default:
          unhandled.add(key);
          unhandled.add(value);
          break;
      }
    }
  }

  @override
  CommentDeleteResponse deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = CommentDeleteResponseBuilder();
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
