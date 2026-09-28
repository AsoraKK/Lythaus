//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:built_collection/built_collection.dart';
import 'package:lythaus_api_client/src/model/alpha_admin_case.dart';
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'alpha_admin_case_list.g.dart';

/// AlphaAdminCaseList
///
/// Properties:
/// * [items]
@BuiltValue()
abstract class AlphaAdminCaseList implements Built<AlphaAdminCaseList, AlphaAdminCaseListBuilder> {
  @BuiltValueField(wireName: r'items')
  BuiltList<AlphaAdminCase> get items;

  AlphaAdminCaseList._();

  factory AlphaAdminCaseList([void updates(AlphaAdminCaseListBuilder b)]) = _$AlphaAdminCaseList;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(AlphaAdminCaseListBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<AlphaAdminCaseList> get serializer => _$AlphaAdminCaseListSerializer();
}

class _$AlphaAdminCaseListSerializer implements PrimitiveSerializer<AlphaAdminCaseList> {
  @override
  final Iterable<Type> types = const [AlphaAdminCaseList, _$AlphaAdminCaseList];

  @override
  final String wireName = r'AlphaAdminCaseList';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    AlphaAdminCaseList object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    yield r'items';
    yield serializers.serialize(
      object.items,
      specifiedType: const FullType(BuiltList, [FullType(AlphaAdminCase)]),
    );
  }

  @override
  Object serialize(
    Serializers serializers,
    AlphaAdminCaseList object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required AlphaAdminCaseListBuilder result,
    required List<Object?> unhandled,
  }) {
    for (var i = 0; i < serializedList.length; i += 2) {
      final key = serializedList[i] as String;
      final value = serializedList[i + 1];
      switch (key) {
        case r'items':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(BuiltList, [FullType(AlphaAdminCase)]),
          ) as BuiltList<AlphaAdminCase>;
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
  AlphaAdminCaseList deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = AlphaAdminCaseListBuilder();
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
