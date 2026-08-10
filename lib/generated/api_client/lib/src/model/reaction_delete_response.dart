//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'reaction_delete_response.g.dart';

/// ReactionDeleteResponse
///
/// Properties:
/// * [postId]
/// * [removed]
@BuiltValue()
abstract class ReactionDeleteResponse implements Built<ReactionDeleteResponse, ReactionDeleteResponseBuilder> {
  @BuiltValueField(wireName: r'postId')
  String get postId;

  @BuiltValueField(wireName: r'removed')
  bool get removed;

  ReactionDeleteResponse._();

  factory ReactionDeleteResponse([void updates(ReactionDeleteResponseBuilder b)]) = _$ReactionDeleteResponse;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(ReactionDeleteResponseBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<ReactionDeleteResponse> get serializer => _$ReactionDeleteResponseSerializer();
}

class _$ReactionDeleteResponseSerializer implements PrimitiveSerializer<ReactionDeleteResponse> {
  @override
  final Iterable<Type> types = const [ReactionDeleteResponse, _$ReactionDeleteResponse];

  @override
  final String wireName = r'ReactionDeleteResponse';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    ReactionDeleteResponse object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    yield r'postId';
    yield serializers.serialize(
      object.postId,
      specifiedType: const FullType(String),
    );
    yield r'removed';
    yield serializers.serialize(
      object.removed,
      specifiedType: const FullType(bool),
    );
  }

  @override
  Object serialize(
    Serializers serializers,
    ReactionDeleteResponse object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required ReactionDeleteResponseBuilder result,
    required List<Object?> unhandled,
  }) {
    for (var i = 0; i < serializedList.length; i += 2) {
      final key = serializedList[i] as String;
      final value = serializedList[i + 1];
      switch (key) {
        case r'postId':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.postId = valueDes;
          break;
        case r'removed':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(bool),
          ) as bool;
          result.removed = valueDes;
          break;
        default:
          unhandled.add(key);
          unhandled.add(value);
          break;
      }
    }
  }

  @override
  ReactionDeleteResponse deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = ReactionDeleteResponseBuilder();
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
