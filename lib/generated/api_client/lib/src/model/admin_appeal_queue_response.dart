//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:built_collection/built_collection.dart';
import 'package:lythaus_api_client/src/model/admin_appeal_queue_item.dart';
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'admin_appeal_queue_response.g.dart';

/// AdminAppealQueueResponse
///
/// Properties:
/// * [items]
/// * [nextCursor]
/// * [count]
@BuiltValue()
abstract class AdminAppealQueueResponse implements Built<AdminAppealQueueResponse, AdminAppealQueueResponseBuilder> {
  @BuiltValueField(wireName: r'items')
  BuiltList<AdminAppealQueueItem> get items;

  @BuiltValueField(wireName: r'nextCursor')
  String? get nextCursor;

  @BuiltValueField(wireName: r'count')
  int get count;

  AdminAppealQueueResponse._();

  factory AdminAppealQueueResponse([void updates(AdminAppealQueueResponseBuilder b)]) = _$AdminAppealQueueResponse;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(AdminAppealQueueResponseBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<AdminAppealQueueResponse> get serializer => _$AdminAppealQueueResponseSerializer();
}

class _$AdminAppealQueueResponseSerializer implements PrimitiveSerializer<AdminAppealQueueResponse> {
  @override
  final Iterable<Type> types = const [AdminAppealQueueResponse, _$AdminAppealQueueResponse];

  @override
  final String wireName = r'AdminAppealQueueResponse';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    AdminAppealQueueResponse object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    yield r'items';
    yield serializers.serialize(
      object.items,
      specifiedType: const FullType(BuiltList, [FullType(AdminAppealQueueItem)]),
    );
    if (object.nextCursor != null) {
      yield r'nextCursor';
      yield serializers.serialize(
        object.nextCursor,
        specifiedType: const FullType(String),
      );
    }
    yield r'count';
    yield serializers.serialize(
      object.count,
      specifiedType: const FullType(int),
    );
  }

  @override
  Object serialize(
    Serializers serializers,
    AdminAppealQueueResponse object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required AdminAppealQueueResponseBuilder result,
    required List<Object?> unhandled,
  }) {
    for (var i = 0; i < serializedList.length; i += 2) {
      final key = serializedList[i] as String;
      final value = serializedList[i + 1];
      switch (key) {
        case r'items':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(BuiltList, [FullType(AdminAppealQueueItem)]),
          ) as BuiltList<AdminAppealQueueItem>;
          result.items.replace(valueDes);
          break;
        case r'nextCursor':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.nextCursor = valueDes;
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
  AdminAppealQueueResponse deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = AdminAppealQueueResponseBuilder();
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
