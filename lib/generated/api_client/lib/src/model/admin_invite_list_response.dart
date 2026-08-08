//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:built_collection/built_collection.dart';
import 'package:lythaus_api_client/src/model/admin_created_invite.dart';
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'admin_invite_list_response.g.dart';

/// AdminInviteListResponse
///
/// Properties:
/// * [invites]
/// * [count]
/// * [nextCursor]
@BuiltValue()
abstract class AdminInviteListResponse implements Built<AdminInviteListResponse, AdminInviteListResponseBuilder> {
  @BuiltValueField(wireName: r'invites')
  BuiltList<AdminCreatedInvite> get invites;

  @BuiltValueField(wireName: r'count')
  int get count;

  @BuiltValueField(wireName: r'nextCursor')
  String? get nextCursor;

  AdminInviteListResponse._();

  factory AdminInviteListResponse([void updates(AdminInviteListResponseBuilder b)]) = _$AdminInviteListResponse;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(AdminInviteListResponseBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<AdminInviteListResponse> get serializer => _$AdminInviteListResponseSerializer();
}

class _$AdminInviteListResponseSerializer implements PrimitiveSerializer<AdminInviteListResponse> {
  @override
  final Iterable<Type> types = const [AdminInviteListResponse, _$AdminInviteListResponse];

  @override
  final String wireName = r'AdminInviteListResponse';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    AdminInviteListResponse object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    yield r'invites';
    yield serializers.serialize(
      object.invites,
      specifiedType: const FullType(BuiltList, [FullType(AdminCreatedInvite)]),
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
    AdminInviteListResponse object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required AdminInviteListResponseBuilder result,
    required List<Object?> unhandled,
  }) {
    for (var i = 0; i < serializedList.length; i += 2) {
      final key = serializedList[i] as String;
      final value = serializedList[i + 1];
      switch (key) {
        case r'invites':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(BuiltList, [FullType(AdminCreatedInvite)]),
          ) as BuiltList<AdminCreatedInvite>;
          result.invites.replace(valueDes);
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
  AdminInviteListResponse deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = AdminInviteListResponseBuilder();
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
