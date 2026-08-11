//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'relation_change.g.dart';

/// RelationChange
///
/// Properties:
/// * [userId]
/// * [blocked]
/// * [muted]
@BuiltValue()
abstract class RelationChange implements Built<RelationChange, RelationChangeBuilder> {
  @BuiltValueField(wireName: r'userId')
  String get userId;

  @BuiltValueField(wireName: r'blocked')
  bool? get blocked;

  @BuiltValueField(wireName: r'muted')
  bool? get muted;

  RelationChange._();

  factory RelationChange([void updates(RelationChangeBuilder b)]) = _$RelationChange;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(RelationChangeBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<RelationChange> get serializer => _$RelationChangeSerializer();
}

class _$RelationChangeSerializer implements PrimitiveSerializer<RelationChange> {
  @override
  final Iterable<Type> types = const [RelationChange, _$RelationChange];

  @override
  final String wireName = r'RelationChange';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    RelationChange object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    yield r'userId';
    yield serializers.serialize(
      object.userId,
      specifiedType: const FullType(String),
    );
    if (object.blocked != null) {
      yield r'blocked';
      yield serializers.serialize(
        object.blocked,
        specifiedType: const FullType(bool),
      );
    }
    if (object.muted != null) {
      yield r'muted';
      yield serializers.serialize(
        object.muted,
        specifiedType: const FullType(bool),
      );
    }
  }

  @override
  Object serialize(
    Serializers serializers,
    RelationChange object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required RelationChangeBuilder result,
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
        case r'blocked':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(bool),
          ) as bool;
          result.blocked = valueDes;
          break;
        case r'muted':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(bool),
          ) as bool;
          result.muted = valueDes;
          break;
        default:
          unhandled.add(key);
          unhandled.add(value);
          break;
      }
    }
  }

  @override
  RelationChange deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = RelationChangeBuilder();
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
