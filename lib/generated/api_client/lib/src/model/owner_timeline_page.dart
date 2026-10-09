//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:lythaus_api_client/src/model/owner_timeline_post.dart';
import 'package:built_collection/built_collection.dart';
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'owner_timeline_page.g.dart';

/// OwnerTimelinePage
///
/// Properties:
/// * [items]
/// * [nextCursor]
@BuiltValue()
abstract class OwnerTimelinePage implements Built<OwnerTimelinePage, OwnerTimelinePageBuilder> {
  @BuiltValueField(wireName: r'items')
  BuiltList<OwnerTimelinePost> get items;

  @BuiltValueField(wireName: r'nextCursor')
  String? get nextCursor;

  OwnerTimelinePage._();

  factory OwnerTimelinePage([void updates(OwnerTimelinePageBuilder b)]) = _$OwnerTimelinePage;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(OwnerTimelinePageBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<OwnerTimelinePage> get serializer => _$OwnerTimelinePageSerializer();
}

class _$OwnerTimelinePageSerializer implements PrimitiveSerializer<OwnerTimelinePage> {
  @override
  final Iterable<Type> types = const [OwnerTimelinePage, _$OwnerTimelinePage];

  @override
  final String wireName = r'OwnerTimelinePage';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    OwnerTimelinePage object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    yield r'items';
    yield serializers.serialize(
      object.items,
      specifiedType: const FullType(BuiltList, [FullType(OwnerTimelinePost)]),
    );
    yield r'nextCursor';
    yield object.nextCursor == null ? null : serializers.serialize(
      object.nextCursor,
      specifiedType: const FullType.nullable(String),
    );
  }

  @override
  Object serialize(
    Serializers serializers,
    OwnerTimelinePage object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required OwnerTimelinePageBuilder result,
    required List<Object?> unhandled,
  }) {
    for (var i = 0; i < serializedList.length; i += 2) {
      final key = serializedList[i] as String;
      final value = serializedList[i + 1];
      switch (key) {
        case r'items':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(BuiltList, [FullType(OwnerTimelinePost)]),
          ) as BuiltList<OwnerTimelinePost>;
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
  OwnerTimelinePage deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = OwnerTimelinePageBuilder();
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
