//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'follow_status.g.dart';

/// FollowStatus
///
/// Properties:
/// * [userId]
/// * [following]
/// * [followedBy]
/// * [blocked]
@BuiltValue()
abstract class FollowStatus implements Built<FollowStatus, FollowStatusBuilder> {
  @BuiltValueField(wireName: r'userId')
  String get userId;

  @BuiltValueField(wireName: r'following')
  bool get following;

  @BuiltValueField(wireName: r'followedBy')
  bool get followedBy;

  @BuiltValueField(wireName: r'blocked')
  bool get blocked;

  FollowStatus._();

  factory FollowStatus([void updates(FollowStatusBuilder b)]) = _$FollowStatus;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(FollowStatusBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<FollowStatus> get serializer => _$FollowStatusSerializer();
}

class _$FollowStatusSerializer implements PrimitiveSerializer<FollowStatus> {
  @override
  final Iterable<Type> types = const [FollowStatus, _$FollowStatus];

  @override
  final String wireName = r'FollowStatus';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    FollowStatus object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    yield r'userId';
    yield serializers.serialize(
      object.userId,
      specifiedType: const FullType(String),
    );
    yield r'following';
    yield serializers.serialize(
      object.following,
      specifiedType: const FullType(bool),
    );
    yield r'followedBy';
    yield serializers.serialize(
      object.followedBy,
      specifiedType: const FullType(bool),
    );
    yield r'blocked';
    yield serializers.serialize(
      object.blocked,
      specifiedType: const FullType(bool),
    );
  }

  @override
  Object serialize(
    Serializers serializers,
    FollowStatus object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required FollowStatusBuilder result,
    required List<Object?> unhandled,
  }) {
    for (var i = 0; i < serializedList.length; i += 2) {
      final key = serializedList[i] as String;
      final value = serializedList[i + 1];
      switch (key) {
        case r'userId':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.userId = valueDes;
          break;
        case r'following':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(bool),
          ) as bool;
          result.following = valueDes;
          break;
        case r'followedBy':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(bool),
          ) as bool;
          result.followedBy = valueDes;
          break;
        case r'blocked':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(bool),
          ) as bool;
          result.blocked = valueDes;
          break;
        default:
          unhandled.add(key);
          unhandled.add(value);
          break;
      }
    }
  }

  @override
  FollowStatus deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = FollowStatusBuilder();
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
