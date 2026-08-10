//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:built_collection/built_collection.dart';
import 'package:lythaus_api_client/src/model/pending_appeal_adjudication.dart';
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'pending_appeal_adjudication_list.g.dart';

/// PendingAppealAdjudicationList
///
/// Properties:
/// * [items]
@BuiltValue()
abstract class PendingAppealAdjudicationList implements Built<PendingAppealAdjudicationList, PendingAppealAdjudicationListBuilder> {
  @BuiltValueField(wireName: r'items')
  BuiltList<PendingAppealAdjudication> get items;

  PendingAppealAdjudicationList._();

  factory PendingAppealAdjudicationList([void updates(PendingAppealAdjudicationListBuilder b)]) = _$PendingAppealAdjudicationList;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(PendingAppealAdjudicationListBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<PendingAppealAdjudicationList> get serializer => _$PendingAppealAdjudicationListSerializer();
}

class _$PendingAppealAdjudicationListSerializer implements PrimitiveSerializer<PendingAppealAdjudicationList> {
  @override
  final Iterable<Type> types = const [PendingAppealAdjudicationList, _$PendingAppealAdjudicationList];

  @override
  final String wireName = r'PendingAppealAdjudicationList';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    PendingAppealAdjudicationList object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    yield r'items';
    yield serializers.serialize(
      object.items,
      specifiedType: const FullType(BuiltList, [FullType(PendingAppealAdjudication)]),
    );
  }

  @override
  Object serialize(
    Serializers serializers,
    PendingAppealAdjudicationList object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required PendingAppealAdjudicationListBuilder result,
    required List<Object?> unhandled,
  }) {
    for (var i = 0; i < serializedList.length; i += 2) {
      final key = serializedList[i] as String;
      final value = serializedList[i + 1];
      switch (key) {
        case r'items':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(BuiltList, [FullType(PendingAppealAdjudication)]),
          ) as BuiltList<PendingAppealAdjudication>;
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
  PendingAppealAdjudicationList deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = PendingAppealAdjudicationListBuilder();
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
