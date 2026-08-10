//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'follow_change.g.dart';

/// FollowChange
///
/// Properties:
/// * [following]
/// * [created]
/// * [removed]
@BuiltValue()
abstract class FollowChange implements Built<FollowChange, FollowChangeBuilder> {
  @BuiltValueField(wireName: r'following')
  String get following;

  @BuiltValueField(wireName: r'created')
  bool? get created;

  @BuiltValueField(wireName: r'removed')
  bool? get removed;

  FollowChange._();

  factory FollowChange([void updates(FollowChangeBuilder b)]) = _$FollowChange;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(FollowChangeBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<FollowChange> get serializer => _$FollowChangeSerializer();
}

class _$FollowChangeSerializer implements PrimitiveSerializer<FollowChange> {
  @override
  final Iterable<Type> types = const [FollowChange, _$FollowChange];

  @override
  final String wireName = r'FollowChange';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    FollowChange object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    yield r'following';
    yield serializers.serialize(
      object.following,
      specifiedType: const FullType(String),
    );
    if (object.created != null) {
      yield r'created';
      yield serializers.serialize(
        object.created,
        specifiedType: const FullType(bool),
      );
    }
    if (object.removed != null) {
      yield r'removed';
      yield serializers.serialize(
        object.removed,
        specifiedType: const FullType(bool),
      );
    }
  }

  @override
  Object serialize(
    Serializers serializers,
    FollowChange object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required FollowChangeBuilder result,
    required List<Object?> unhandled,
  }) {
    for (var i = 0; i < serializedList.length; i += 2) {
      final key = serializedList[i] as String;
      final value = serializedList[i + 1];
      switch (key) {
        case r'following':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.following = valueDes;
          break;
        case r'created':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(bool),
          ) as bool;
          result.created = valueDes;
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
  FollowChange deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = FollowChangeBuilder();
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
