//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:built_collection/built_collection.dart';
import 'package:built_value/json_object.dart';
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'admin_items.g.dart';

/// AdminItems
///
/// Properties:
/// * [items]
@BuiltValue()
abstract class AdminItems implements Built<AdminItems, AdminItemsBuilder> {
  @BuiltValueField(wireName: r'items')
  BuiltList<BuiltMap<String, JsonObject?>> get items;

  AdminItems._();

  factory AdminItems([void updates(AdminItemsBuilder b)]) = _$AdminItems;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(AdminItemsBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<AdminItems> get serializer => _$AdminItemsSerializer();
}

class _$AdminItemsSerializer implements PrimitiveSerializer<AdminItems> {
  @override
  final Iterable<Type> types = const [AdminItems, _$AdminItems];

  @override
  final String wireName = r'AdminItems';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    AdminItems object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    yield r'items';
    yield serializers.serialize(
      object.items,
      specifiedType: const FullType(BuiltList, [FullType(BuiltMap, [FullType(String), FullType.nullable(JsonObject)])]),
    );
  }

  @override
  Object serialize(
    Serializers serializers,
    AdminItems object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required AdminItemsBuilder result,
    required List<Object?> unhandled,
  }) {
    for (var i = 0; i < serializedList.length; i += 2) {
      final key = serializedList[i] as String;
      final value = serializedList[i + 1];
      switch (key) {
        case r'items':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(BuiltList, [FullType(BuiltMap, [FullType(String), FullType.nullable(JsonObject)])]),
          ) as BuiltList<BuiltMap<String, JsonObject?>>;
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
  AdminItems deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = AdminItemsBuilder();
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
