//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:built_collection/built_collection.dart';
import 'package:lythaus_api_client/src/model/custom_feed_definition.dart';
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'custom_feed_list_response.g.dart';

/// CustomFeedListResponse
///
/// Properties:
/// * [items]
/// * [nextCursor]
@BuiltValue()
abstract class CustomFeedListResponse implements Built<CustomFeedListResponse, CustomFeedListResponseBuilder> {
  @BuiltValueField(wireName: r'items')
  BuiltList<CustomFeedDefinition> get items;

  @BuiltValueField(wireName: r'nextCursor')
  String? get nextCursor;

  CustomFeedListResponse._();

  factory CustomFeedListResponse([void updates(CustomFeedListResponseBuilder b)]) = _$CustomFeedListResponse;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(CustomFeedListResponseBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<CustomFeedListResponse> get serializer => _$CustomFeedListResponseSerializer();
}

class _$CustomFeedListResponseSerializer implements PrimitiveSerializer<CustomFeedListResponse> {
  @override
  final Iterable<Type> types = const [CustomFeedListResponse, _$CustomFeedListResponse];

  @override
  final String wireName = r'CustomFeedListResponse';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    CustomFeedListResponse object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    yield r'items';
    yield serializers.serialize(
      object.items,
      specifiedType: const FullType(BuiltList, [FullType(CustomFeedDefinition)]),
    );
    if (object.nextCursor != null) {
      yield r'nextCursor';
      yield serializers.serialize(
        object.nextCursor,
        specifiedType: const FullType.nullable(String),
      );
    }
  }

  @override
  Object serialize(
    Serializers serializers,
    CustomFeedListResponse object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required CustomFeedListResponseBuilder result,
    required List<Object?> unhandled,
  }) {
    for (var i = 0; i < serializedList.length; i += 2) {
      final key = serializedList[i] as String;
      final value = serializedList[i + 1];
      switch (key) {
        case r'items':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(BuiltList, [FullType(CustomFeedDefinition)]),
          ) as BuiltList<CustomFeedDefinition>;
          result.items.replace(valueDes);
          break;
        case r'nextCursor':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType.nullable(String),
          ) as String?;
          if (valueDes == null) continue;
          result.nextCursor = valueDes;
          break;
        default:
          unhandled.add(key);
          unhandled.add(value);
          break;
      }
    }
  }

  @override
  CustomFeedListResponse deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = CustomFeedListResponseBuilder();
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
