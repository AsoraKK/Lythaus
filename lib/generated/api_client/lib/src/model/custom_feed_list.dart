//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:lythaus_api_client/src/model/custom_feed.dart';
import 'package:built_collection/built_collection.dart';
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'custom_feed_list.g.dart';

/// CustomFeedList
///
/// Properties:
/// * [items]
@BuiltValue()
abstract class CustomFeedList implements Built<CustomFeedList, CustomFeedListBuilder> {
  @BuiltValueField(wireName: r'items')
  BuiltList<CustomFeed> get items;

  CustomFeedList._();

  factory CustomFeedList([void updates(CustomFeedListBuilder b)]) = _$CustomFeedList;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(CustomFeedListBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<CustomFeedList> get serializer => _$CustomFeedListSerializer();
}

class _$CustomFeedListSerializer implements PrimitiveSerializer<CustomFeedList> {
  @override
  final Iterable<Type> types = const [CustomFeedList, _$CustomFeedList];

  @override
  final String wireName = r'CustomFeedList';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    CustomFeedList object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    yield r'items';
    yield serializers.serialize(
      object.items,
      specifiedType: const FullType(BuiltList, [FullType(CustomFeed)]),
    );
  }

  @override
  Object serialize(
    Serializers serializers,
    CustomFeedList object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required CustomFeedListBuilder result,
    required List<Object?> unhandled,
  }) {
    for (var i = 0; i < serializedList.length; i += 2) {
      final key = serializedList[i] as String;
      final value = serializedList[i + 1];
      switch (key) {
        case r'items':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(BuiltList, [FullType(CustomFeed)]),
          ) as BuiltList<CustomFeed>;
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
  CustomFeedList deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = CustomFeedListBuilder();
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
