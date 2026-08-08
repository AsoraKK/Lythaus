//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:lythaus_api_client/src/model/admin_user_summary.dart';
import 'package:built_collection/built_collection.dart';
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'admin_user_search_response.g.dart';

/// AdminUserSearchResponse
///
/// Properties:
/// * [items]
/// * [count]
@BuiltValue()
abstract class AdminUserSearchResponse implements Built<AdminUserSearchResponse, AdminUserSearchResponseBuilder> {
  @BuiltValueField(wireName: r'items')
  BuiltList<AdminUserSummary> get items;

  @BuiltValueField(wireName: r'count')
  int get count;

  AdminUserSearchResponse._();

  factory AdminUserSearchResponse([void updates(AdminUserSearchResponseBuilder b)]) = _$AdminUserSearchResponse;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(AdminUserSearchResponseBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<AdminUserSearchResponse> get serializer => _$AdminUserSearchResponseSerializer();
}

class _$AdminUserSearchResponseSerializer implements PrimitiveSerializer<AdminUserSearchResponse> {
  @override
  final Iterable<Type> types = const [AdminUserSearchResponse, _$AdminUserSearchResponse];

  @override
  final String wireName = r'AdminUserSearchResponse';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    AdminUserSearchResponse object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    yield r'items';
    yield serializers.serialize(
      object.items,
      specifiedType: const FullType(BuiltList, [FullType(AdminUserSummary)]),
    );
    yield r'count';
    yield serializers.serialize(
      object.count,
      specifiedType: const FullType(int),
    );
  }

  @override
  Object serialize(
    Serializers serializers,
    AdminUserSearchResponse object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required AdminUserSearchResponseBuilder result,
    required List<Object?> unhandled,
  }) {
    for (var i = 0; i < serializedList.length; i += 2) {
      final key = serializedList[i] as String;
      final value = serializedList[i + 1];
      switch (key) {
        case r'items':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(BuiltList, [FullType(AdminUserSummary)]),
          ) as BuiltList<AdminUserSummary>;
          result.items.replace(valueDes);
          break;
        case r'count':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(int),
          ) as int;
          result.count = valueDes;
          break;
        default:
          unhandled.add(key);
          unhandled.add(value);
          break;
      }
    }
  }

  @override
  AdminUserSearchResponse deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = AdminUserSearchResponseBuilder();
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
