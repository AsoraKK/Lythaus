//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:lythaus_api_client/src/model/beta_case.dart';
import 'package:built_collection/built_collection.dart';
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'beta_case_list.g.dart';

/// BetaCaseList
///
/// Properties:
/// * [items]
@BuiltValue()
abstract class BetaCaseList implements Built<BetaCaseList, BetaCaseListBuilder> {
  @BuiltValueField(wireName: r'items')
  BuiltList<BetaCase> get items;

  BetaCaseList._();

  factory BetaCaseList([void updates(BetaCaseListBuilder b)]) = _$BetaCaseList;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(BetaCaseListBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<BetaCaseList> get serializer => _$BetaCaseListSerializer();
}

class _$BetaCaseListSerializer implements PrimitiveSerializer<BetaCaseList> {
  @override
  final Iterable<Type> types = const [BetaCaseList, _$BetaCaseList];

  @override
  final String wireName = r'BetaCaseList';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    BetaCaseList object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    yield r'items';
    yield serializers.serialize(
      object.items,
      specifiedType: const FullType(BuiltList, [FullType(BetaCase)]),
    );
  }

  @override
  Object serialize(
    Serializers serializers,
    BetaCaseList object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required BetaCaseListBuilder result,
    required List<Object?> unhandled,
  }) {
    for (var i = 0; i < serializedList.length; i += 2) {
      final key = serializedList[i] as String;
      final value = serializedList[i + 1];
      switch (key) {
        case r'items':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(BuiltList, [FullType(BetaCase)]),
          ) as BuiltList<BetaCase>;
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
  BetaCaseList deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = BetaCaseListBuilder();
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
