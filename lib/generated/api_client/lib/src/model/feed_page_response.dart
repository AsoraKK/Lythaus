//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:lythaus_api_client/src/model/feed_page_response_meta.dart';
import 'package:built_collection/built_collection.dart';
import 'package:built_value/json_object.dart';
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'feed_page_response.g.dart';

/// Paginated feed page data and metadata.
///
/// Properties:
/// * [items] - Feed items for this page
/// * [meta]
@BuiltValue()
abstract class FeedPageResponse implements Built<FeedPageResponse, FeedPageResponseBuilder> {
  /// Feed items for this page
  @BuiltValueField(wireName: r'items')
  BuiltList<BuiltMap<String, JsonObject?>> get items;

  @BuiltValueField(wireName: r'meta')
  FeedPageResponseMeta get meta;

  FeedPageResponse._();

  factory FeedPageResponse([void updates(FeedPageResponseBuilder b)]) = _$FeedPageResponse;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(FeedPageResponseBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<FeedPageResponse> get serializer => _$FeedPageResponseSerializer();
}

class _$FeedPageResponseSerializer implements PrimitiveSerializer<FeedPageResponse> {
  @override
  final Iterable<Type> types = const [FeedPageResponse, _$FeedPageResponse];

  @override
  final String wireName = r'FeedPageResponse';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    FeedPageResponse object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    yield r'items';
    yield serializers.serialize(
      object.items,
      specifiedType: const FullType(BuiltList, [FullType(BuiltMap, [FullType(String), FullType.nullable(JsonObject)])]),
    );
    yield r'meta';
    yield serializers.serialize(
      object.meta,
      specifiedType: const FullType(FeedPageResponseMeta),
    );
  }

  @override
  Object serialize(
    Serializers serializers,
    FeedPageResponse object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required FeedPageResponseBuilder result,
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
        case r'meta':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(FeedPageResponseMeta),
          ) as FeedPageResponseMeta;
          result.meta.replace(valueDes);
          break;
        default:
          unhandled.add(key);
          unhandled.add(value);
          break;
      }
    }
  }

  @override
  FeedPageResponse deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = FeedPageResponseBuilder();
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
