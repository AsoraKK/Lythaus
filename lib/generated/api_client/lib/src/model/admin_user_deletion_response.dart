//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:built_collection/built_collection.dart';
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'admin_user_deletion_response.g.dart';

/// AdminUserDeletionResponse
///
/// Properties:
/// * [userId]
/// * [requestId]
/// * [status]
/// * [legalHold]
/// * [purgeState]
@BuiltValue()
abstract class AdminUserDeletionResponse implements Built<AdminUserDeletionResponse, AdminUserDeletionResponseBuilder> {
  @BuiltValueField(wireName: r'userId')
  String get userId;

  @BuiltValueField(wireName: r'requestId')
  String get requestId;

  @BuiltValueField(wireName: r'status')
  AdminUserDeletionResponseStatusEnum get status;
  // enum statusEnum {  deleted,  };

  @BuiltValueField(wireName: r'legalHold')
  bool get legalHold;

  @BuiltValueField(wireName: r'purgeState')
  AdminUserDeletionResponsePurgeStateEnum get purgeState;
  // enum purgeStateEnum {  pending_purge,  blocked_by_legal_hold,  };

  AdminUserDeletionResponse._();

  factory AdminUserDeletionResponse([void updates(AdminUserDeletionResponseBuilder b)]) = _$AdminUserDeletionResponse;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(AdminUserDeletionResponseBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<AdminUserDeletionResponse> get serializer => _$AdminUserDeletionResponseSerializer();
}

class _$AdminUserDeletionResponseSerializer implements PrimitiveSerializer<AdminUserDeletionResponse> {
  @override
  final Iterable<Type> types = const [AdminUserDeletionResponse, _$AdminUserDeletionResponse];

  @override
  final String wireName = r'AdminUserDeletionResponse';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    AdminUserDeletionResponse object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    yield r'userId';
    yield serializers.serialize(
      object.userId,
      specifiedType: const FullType(String),
    );
    yield r'requestId';
    yield serializers.serialize(
      object.requestId,
      specifiedType: const FullType(String),
    );
    yield r'status';
    yield serializers.serialize(
      object.status,
      specifiedType: const FullType(AdminUserDeletionResponseStatusEnum),
    );
    yield r'legalHold';
    yield serializers.serialize(
      object.legalHold,
      specifiedType: const FullType(bool),
    );
    yield r'purgeState';
    yield serializers.serialize(
      object.purgeState,
      specifiedType: const FullType(AdminUserDeletionResponsePurgeStateEnum),
    );
  }

  @override
  Object serialize(
    Serializers serializers,
    AdminUserDeletionResponse object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required AdminUserDeletionResponseBuilder result,
    required List<Object?> unhandled,
  }) {
    for (var i = 0; i < serializedList.length; i += 2) {
      final key = serializedList[i] as String;
      final value = serializedList[i + 1];
      switch (key) {
        case r'userId':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.userId = valueDes;
          break;
        case r'requestId':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.requestId = valueDes;
          break;
        case r'status':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(AdminUserDeletionResponseStatusEnum),
          ) as AdminUserDeletionResponseStatusEnum;
          result.status = valueDes;
          break;
        case r'legalHold':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(bool),
          ) as bool;
          result.legalHold = valueDes;
          break;
        case r'purgeState':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(AdminUserDeletionResponsePurgeStateEnum),
          ) as AdminUserDeletionResponsePurgeStateEnum;
          result.purgeState = valueDes;
          break;
        default:
          unhandled.add(key);
          unhandled.add(value);
          break;
      }
    }
  }

  @override
  AdminUserDeletionResponse deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = AdminUserDeletionResponseBuilder();
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

class AdminUserDeletionResponseStatusEnum extends EnumClass {

  @BuiltValueEnumConst(wireName: r'deleted')
  static const AdminUserDeletionResponseStatusEnum deleted = _$adminUserDeletionResponseStatusEnum_deleted;

  static Serializer<AdminUserDeletionResponseStatusEnum> get serializer => _$adminUserDeletionResponseStatusEnumSerializer;

  const AdminUserDeletionResponseStatusEnum._(String name): super(name);

  static BuiltSet<AdminUserDeletionResponseStatusEnum> get values => _$adminUserDeletionResponseStatusEnumValues;
  static AdminUserDeletionResponseStatusEnum valueOf(String name) => _$adminUserDeletionResponseStatusEnumValueOf(name);
}

class AdminUserDeletionResponsePurgeStateEnum extends EnumClass {

  @BuiltValueEnumConst(wireName: r'pending_purge')
  static const AdminUserDeletionResponsePurgeStateEnum pendingPurge = _$adminUserDeletionResponsePurgeStateEnum_pendingPurge;
  @BuiltValueEnumConst(wireName: r'blocked_by_legal_hold')
  static const AdminUserDeletionResponsePurgeStateEnum blockedByLegalHold = _$adminUserDeletionResponsePurgeStateEnum_blockedByLegalHold;

  static Serializer<AdminUserDeletionResponsePurgeStateEnum> get serializer => _$adminUserDeletionResponsePurgeStateEnumSerializer;

  const AdminUserDeletionResponsePurgeStateEnum._(String name): super(name);

  static BuiltSet<AdminUserDeletionResponsePurgeStateEnum> get values => _$adminUserDeletionResponsePurgeStateEnumValues;
  static AdminUserDeletionResponsePurgeStateEnum valueOf(String name) => _$adminUserDeletionResponsePurgeStateEnumValueOf(name);
}
