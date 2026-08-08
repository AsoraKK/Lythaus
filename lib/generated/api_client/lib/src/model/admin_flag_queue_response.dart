//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:lythaus_api_client/src/model/admin_flag_queue_item.dart';
import 'package:built_collection/built_collection.dart';
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'admin_flag_queue_response.g.dart';

/// AdminFlagQueueResponse
///
/// Properties:
/// * [items]
/// * [nextCursor]
/// * [count]
@BuiltValue()
abstract class AdminFlagQueueResponse implements Built<AdminFlagQueueResponse, AdminFlagQueueResponseBuilder> {
  @BuiltValueField(wireName: r'items')
  BuiltList<AdminFlagQueueItem> get items;

  @BuiltValueField(wireName: r'nextCursor')
  String? get nextCursor;

  @BuiltValueField(wireName: r'count')
  int get count;

  AdminFlagQueueResponse._();

  factory AdminFlagQueueResponse([void updates(AdminFlagQueueResponseBuilder b)]) = _$AdminFlagQueueResponse;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(AdminFlagQueueResponseBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<AdminFlagQueueResponse> get serializer => _$AdminFlagQueueResponseSerializer();
}

class _$AdminFlagQueueResponseSerializer implements PrimitiveSerializer<AdminFlagQueueResponse> {
  @override
  final Iterable<Type> types = const [AdminFlagQueueResponse, _$AdminFlagQueueResponse];

  @override
  final String wireName = r'AdminFlagQueueResponse';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    AdminFlagQueueResponse object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    yield r'items';
    yield serializers.serialize(
      object.items,
      specifiedType: const FullType(BuiltList, [FullType(AdminFlagQueueItem)]),
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
    AdminFlagQueueResponse object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required AdminFlagQueueResponseBuilder result,
    required List<Object?> unhandled,
  }) {
    for (var i = 0; i < serializedList.length; i += 2) {
      final key = serializedList[i] as String;
      final value = serializedList[i + 1];
      switch (key) {
        case r'items':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(BuiltList, [FullType(AdminFlagQueueItem)]),
          ) as BuiltList<AdminFlagQueueItem>;
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
  AdminFlagQueueResponse deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = AdminFlagQueueResponseBuilder();
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
