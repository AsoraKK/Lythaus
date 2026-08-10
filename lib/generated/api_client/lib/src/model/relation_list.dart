//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:lythaus_api_client/src/model/relation_list_items_inner.dart';
import 'package:built_collection/built_collection.dart';
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'relation_list.g.dart';

/// RelationList
///
/// Properties:
/// * [items]
@BuiltValue()
abstract class RelationList implements Built<RelationList, RelationListBuilder> {
  @BuiltValueField(wireName: r'items')
  BuiltList<RelationListItemsInner> get items;

  RelationList._();

  factory RelationList([void updates(RelationListBuilder b)]) = _$RelationList;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(RelationListBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<RelationList> get serializer => _$RelationListSerializer();
}

class _$RelationListSerializer implements PrimitiveSerializer<RelationList> {
  @override
  final Iterable<Type> types = const [RelationList, _$RelationList];

  @override
  final String wireName = r'RelationList';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    RelationList object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    yield r'items';
    yield serializers.serialize(
      object.items,
      specifiedType: const FullType(BuiltList, [FullType(RelationListItemsInner)]),
    );
  }

  @override
  Object serialize(
    Serializers serializers,
    RelationList object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required RelationListBuilder result,
    required List<Object?> unhandled,
  }) {
    for (var i = 0; i < serializedList.length; i += 2) {
      final key = serializedList[i] as String;
      final value = serializedList[i + 1];
      switch (key) {
        case r'items':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(BuiltList, [FullType(RelationListItemsInner)]),
          ) as BuiltList<RelationListItemsInner>;
          result.items.replace(valueDes);
          break;
        default:
          unhandled.add(key);
          unhandled.add(value);
          break;
      }
    }
  }

  @override
  RelationList deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = RelationListBuilder();
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
