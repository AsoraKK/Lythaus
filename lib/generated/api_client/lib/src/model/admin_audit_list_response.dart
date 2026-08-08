//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:lythaus_api_client/src/model/admin_audit_entry.dart';
import 'package:built_collection/built_collection.dart';
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'admin_audit_list_response.g.dart';

/// AdminAuditListResponse
///
/// Properties:
/// * [items]
/// * [count]
/// * [nextCursor]
@BuiltValue()
abstract class AdminAuditListResponse implements Built<AdminAuditListResponse, AdminAuditListResponseBuilder> {
  @BuiltValueField(wireName: r'items')
  BuiltList<AdminAuditEntry> get items;

  @BuiltValueField(wireName: r'count')
  int get count;

  @BuiltValueField(wireName: r'nextCursor')
  String? get nextCursor;

  AdminAuditListResponse._();

  factory AdminAuditListResponse([void updates(AdminAuditListResponseBuilder b)]) = _$AdminAuditListResponse;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(AdminAuditListResponseBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<AdminAuditListResponse> get serializer => _$AdminAuditListResponseSerializer();
}

class _$AdminAuditListResponseSerializer implements PrimitiveSerializer<AdminAuditListResponse> {
  @override
  final Iterable<Type> types = const [AdminAuditListResponse, _$AdminAuditListResponse];

  @override
  final String wireName = r'AdminAuditListResponse';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    AdminAuditListResponse object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    yield r'items';
    yield serializers.serialize(
      object.items,
      specifiedType: const FullType(BuiltList, [FullType(AdminAuditEntry)]),
    );
    yield r'count';
    yield serializers.serialize(
      object.count,
      specifiedType: const FullType(int),
    );
    if (object.nextCursor != null) {
      yield r'nextCursor';
      yield serializers.serialize(
        object.nextCursor,
        specifiedType: const FullType(String),
      );
    }
  }

  @override
  Object serialize(
    Serializers serializers,
    AdminAuditListResponse object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required AdminAuditListResponseBuilder result,
    required List<Object?> unhandled,
  }) {
    for (var i = 0; i < serializedList.length; i += 2) {
      final key = serializedList[i] as String;
      final value = serializedList[i + 1];
      switch (key) {
        case r'items':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(BuiltList, [FullType(AdminAuditEntry)]),
          ) as BuiltList<AdminAuditEntry>;
          result.items.replace(valueDes);
          break;
        case r'count':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(int),
          ) as int;
          result.count = valueDes;
          break;
        case r'nextCursor':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
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
  AdminAuditListResponse deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = AdminAuditListResponseBuilder();
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
