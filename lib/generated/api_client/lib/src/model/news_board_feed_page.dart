//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:built_collection/built_collection.dart';
import 'package:lythaus_api_client/src/model/news_board_item.dart';
import 'package:lythaus_api_client/src/model/cursor_page.dart';
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'news_board_feed_page.g.dart';

/// NewsBoardFeedPage
///
/// Properties:
/// * [nextCursor] - Opaque cursor for the next page, or null when exhausted.
/// * [access]
/// * [items]
@BuiltValue()
abstract class NewsBoardFeedPage implements CursorPage, Built<NewsBoardFeedPage, NewsBoardFeedPageBuilder> {
  @BuiltValueField(wireName: r'access')
  NewsBoardFeedPageAccessEnum get access;
  // enum accessEnum {  full,  };

  @BuiltValueField(wireName: r'items')
  BuiltList<NewsBoardItem> get items;

  NewsBoardFeedPage._();

  factory NewsBoardFeedPage([void updates(NewsBoardFeedPageBuilder b)]) = _$NewsBoardFeedPage;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(NewsBoardFeedPageBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<NewsBoardFeedPage> get serializer => _$NewsBoardFeedPageSerializer();
}

class _$NewsBoardFeedPageSerializer implements PrimitiveSerializer<NewsBoardFeedPage> {
  @override
  final Iterable<Type> types = const [NewsBoardFeedPage, _$NewsBoardFeedPage];

  @override
  final String wireName = r'NewsBoardFeedPage';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    NewsBoardFeedPage object, {
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
      specifiedType: const FullType(BuiltList, [FullType(NewsBoardItem)]),
    );
    yield r'access';
    yield serializers.serialize(
      object.access,
      specifiedType: const FullType(NewsBoardFeedPageAccessEnum),
    );
  }

  @override
  Object serialize(
    Serializers serializers,
    NewsBoardFeedPage object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required NewsBoardFeedPageBuilder result,
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
            specifiedType: const FullType(BuiltList, [FullType(NewsBoardItem)]),
          ) as BuiltList<NewsBoardItem>;
          result.items.replace(valueDes);
          break;
        case r'access':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(NewsBoardFeedPageAccessEnum),
          ) as NewsBoardFeedPageAccessEnum;
          result.access = valueDes;
          break;
        default:
          unhandled.add(key);
          unhandled.add(value);
          break;
      }
    }
  }

  @override
  NewsBoardFeedPage deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = NewsBoardFeedPageBuilder();
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

class NewsBoardFeedPageAccessEnum extends EnumClass {

  @BuiltValueEnumConst(wireName: r'full')
  static const NewsBoardFeedPageAccessEnum full = _$newsBoardFeedPageAccessEnum_full;

  static Serializer<NewsBoardFeedPageAccessEnum> get serializer => _$newsBoardFeedPageAccessEnumSerializer;

  const NewsBoardFeedPageAccessEnum._(String name): super(name);

  static BuiltSet<NewsBoardFeedPageAccessEnum> get values => _$newsBoardFeedPageAccessEnumValues;
  static NewsBoardFeedPageAccessEnum valueOf(String name) => _$newsBoardFeedPageAccessEnumValueOf(name);
}
