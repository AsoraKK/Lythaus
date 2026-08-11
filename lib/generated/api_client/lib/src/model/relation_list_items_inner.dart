//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'relation_list_items_inner.g.dart';

/// RelationListItemsInner
///
/// Properties:
/// * [userId]
/// * [createdAt]
@BuiltValue()
abstract class RelationListItemsInner implements Built<RelationListItemsInner, RelationListItemsInnerBuilder> {
  @BuiltValueField(wireName: r'userId')
  String get userId;

  @BuiltValueField(wireName: r'createdAt')
  DateTime get createdAt;

  RelationListItemsInner._();

  factory RelationListItemsInner([void updates(RelationListItemsInnerBuilder b)]) = _$RelationListItemsInner;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(RelationListItemsInnerBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<RelationListItemsInner> get serializer => _$RelationListItemsInnerSerializer();
}

class _$RelationListItemsInnerSerializer implements PrimitiveSerializer<RelationListItemsInner> {
  @override
  final Iterable<Type> types = const [RelationListItemsInner, _$RelationListItemsInner];

  @override
  final String wireName = r'RelationListItemsInner';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    RelationListItemsInner object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    yield r'userId';
    yield serializers.serialize(
      object.userId,
      specifiedType: const FullType(String),
    );
    yield r'createdAt';
    yield serializers.serialize(
      object.createdAt,
      specifiedType: const FullType(DateTime),
    );
  }

  @override
  Object serialize(
    Serializers serializers,
    RelationListItemsInner object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required RelationListItemsInnerBuilder result,
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
        case r'createdAt':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(DateTime),
          ) as DateTime;
          result.createdAt = valueDes;
          break;
        default:
          unhandled.add(key);
          unhandled.add(value);
          break;
      }
    }
  }

  @override
  RelationListItemsInner deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = RelationListItemsInnerBuilder();
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
