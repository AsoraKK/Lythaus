//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:built_collection/built_collection.dart';
import 'package:lythaus_api_client/src/model/community_appeal_triage_queue_items_inner.dart';
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'community_appeal_triage_queue.g.dart';

/// CommunityAppealTriageQueue
///
/// Properties:
/// * [items]
@BuiltValue()
abstract class CommunityAppealTriageQueue implements Built<CommunityAppealTriageQueue, CommunityAppealTriageQueueBuilder> {
  @BuiltValueField(wireName: r'items')
  BuiltList<CommunityAppealTriageQueueItemsInner> get items;

  CommunityAppealTriageQueue._();

  factory CommunityAppealTriageQueue([void updates(CommunityAppealTriageQueueBuilder b)]) = _$CommunityAppealTriageQueue;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(CommunityAppealTriageQueueBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<CommunityAppealTriageQueue> get serializer => _$CommunityAppealTriageQueueSerializer();
}

class _$CommunityAppealTriageQueueSerializer implements PrimitiveSerializer<CommunityAppealTriageQueue> {
  @override
  final Iterable<Type> types = const [CommunityAppealTriageQueue, _$CommunityAppealTriageQueue];

  @override
  final String wireName = r'CommunityAppealTriageQueue';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    CommunityAppealTriageQueue object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    yield r'items';
    yield serializers.serialize(
      object.items,
      specifiedType: const FullType(BuiltList, [FullType(CommunityAppealTriageQueueItemsInner)]),
    );
  }

  @override
  Object serialize(
    Serializers serializers,
    CommunityAppealTriageQueue object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required CommunityAppealTriageQueueBuilder result,
    required List<Object?> unhandled,
  }) {
    for (var i = 0; i < serializedList.length; i += 2) {
      final key = serializedList[i] as String;
      final value = serializedList[i + 1];
      switch (key) {
        case r'items':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(BuiltList, [FullType(CommunityAppealTriageQueueItemsInner)]),
          ) as BuiltList<CommunityAppealTriageQueueItemsInner>;
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
  CommunityAppealTriageQueue deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = CommunityAppealTriageQueueBuilder();
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
