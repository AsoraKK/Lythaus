//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:lythaus_api_client/src/model/admin_invite.dart';
import 'package:built_collection/built_collection.dart';
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'admin_invite_batch_response.g.dart';

/// AdminInviteBatchResponse
///
/// Properties:
/// * [count]
/// * [invites]
@BuiltValue()
abstract class AdminInviteBatchResponse implements Built<AdminInviteBatchResponse, AdminInviteBatchResponseBuilder> {
  @BuiltValueField(wireName: r'count')
  int get count;

  @BuiltValueField(wireName: r'invites')
  BuiltList<AdminInvite> get invites;

  AdminInviteBatchResponse._();

  factory AdminInviteBatchResponse([void updates(AdminInviteBatchResponseBuilder b)]) = _$AdminInviteBatchResponse;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(AdminInviteBatchResponseBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<AdminInviteBatchResponse> get serializer => _$AdminInviteBatchResponseSerializer();
}

class _$AdminInviteBatchResponseSerializer implements PrimitiveSerializer<AdminInviteBatchResponse> {
  @override
  final Iterable<Type> types = const [AdminInviteBatchResponse, _$AdminInviteBatchResponse];

  @override
  final String wireName = r'AdminInviteBatchResponse';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    AdminInviteBatchResponse object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    yield r'count';
    yield serializers.serialize(
      object.count,
      specifiedType: const FullType(int),
    );
    yield r'invites';
    yield serializers.serialize(
      object.invites,
      specifiedType: const FullType(BuiltList, [FullType(AdminInvite)]),
    );
  }

  @override
  Object serialize(
    Serializers serializers,
    AdminInviteBatchResponse object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required AdminInviteBatchResponseBuilder result,
    required List<Object?> unhandled,
  }) {
    for (var i = 0; i < serializedList.length; i += 2) {
      final key = serializedList[i] as String;
      final value = serializedList[i + 1];
      switch (key) {
        case r'count':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(int),
          ) as int;
          result.count = valueDes;
          break;
        case r'invites':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(BuiltList, [FullType(AdminInvite)]),
          ) as BuiltList<AdminInvite>;
          result.invites.replace(valueDes);
          break;
        default:
          unhandled.add(key);
          unhandled.add(value);
          break;
      }
    }
  }

  @override
  AdminInviteBatchResponse deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = AdminInviteBatchResponseBuilder();
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
