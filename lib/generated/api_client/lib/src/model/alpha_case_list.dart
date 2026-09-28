//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:lythaus_api_client/src/model/alpha_case.dart';
import 'package:built_collection/built_collection.dart';
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'alpha_case_list.g.dart';

/// AlphaCaseList
///
/// Properties:
/// * [items]
@BuiltValue()
abstract class AlphaCaseList implements Built<AlphaCaseList, AlphaCaseListBuilder> {
  @BuiltValueField(wireName: r'items')
  BuiltList<AlphaCase> get items;

  AlphaCaseList._();

  factory AlphaCaseList([void updates(AlphaCaseListBuilder b)]) = _$AlphaCaseList;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(AlphaCaseListBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<AlphaCaseList> get serializer => _$AlphaCaseListSerializer();
}

class _$AlphaCaseListSerializer implements PrimitiveSerializer<AlphaCaseList> {
  @override
  final Iterable<Type> types = const [AlphaCaseList, _$AlphaCaseList];

  @override
  final String wireName = r'AlphaCaseList';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    AlphaCaseList object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    yield r'items';
    yield serializers.serialize(
      object.items,
      specifiedType: const FullType(BuiltList, [FullType(AlphaCase)]),
    );
  }

  @override
  Object serialize(
    Serializers serializers,
    AlphaCaseList object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required AlphaCaseListBuilder result,
    required List<Object?> unhandled,
  }) {
    for (var i = 0; i < serializedList.length; i += 2) {
      final key = serializedList[i] as String;
      final value = serializedList[i + 1];
      switch (key) {
        case r'items':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(BuiltList, [FullType(AlphaCase)]),
          ) as BuiltList<AlphaCase>;
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
  AlphaCaseList deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = AlphaCaseListBuilder();
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
