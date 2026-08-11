//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:built_collection/built_collection.dart';
import 'package:lythaus_api_client/src/model/cursor_page.dart';
import 'package:lythaus_api_client/src/model/feed_item.dart';
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'discovery_feed_page.g.dart';

/// DiscoveryFeedPage
///
/// Properties:
/// * [nextCursor] - Opaque cursor for the next page, or null when exhausted.
/// * [items]
@BuiltValue()
abstract class DiscoveryFeedPage implements CursorPage, Built<DiscoveryFeedPage, DiscoveryFeedPageBuilder> {
  @BuiltValueField(wireName: r'items')
  BuiltList<FeedItem> get items;

  DiscoveryFeedPage._();

  factory DiscoveryFeedPage([void updates(DiscoveryFeedPageBuilder b)]) = _$DiscoveryFeedPage;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(DiscoveryFeedPageBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<DiscoveryFeedPage> get serializer => _$DiscoveryFeedPageSerializer();
}

class _$DiscoveryFeedPageSerializer implements PrimitiveSerializer<DiscoveryFeedPage> {
  @override
  final Iterable<Type> types = const [DiscoveryFeedPage, _$DiscoveryFeedPage];

  @override
  final String wireName = r'DiscoveryFeedPage';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    DiscoveryFeedPage object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    yield r'nextCursor';
    yield object.nextCursor == null ? null : serializers.serialize(
      object.nextCursor,
      specifiedType: const FullType.nullable(String),
    );
    yield r'items';
    yield serializers.serialize(
      object.items,
      specifiedType: const FullType(BuiltList, [FullType(FeedItem)]),
    );
  }

  @override
  Object serialize(
    Serializers serializers,
    DiscoveryFeedPage object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required DiscoveryFeedPageBuilder result,
    required List<Object?> unhandled,
  }) {
    for (var i = 0; i < serializedList.length; i += 2) {
      final key = serializedList[i] as String;
      final value = serializedList[i + 1];
      switch (key) {
        case r'nextCursor':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType.nullable(String),
          ) as String?;
          if (valueDes == null) continue;
          result.nextCursor = valueDes;
          break;
        case r'items':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(BuiltList, [FullType(FeedItem)]),
          ) as BuiltList<FeedItem>;
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
  DiscoveryFeedPage deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = DiscoveryFeedPageBuilder();
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
