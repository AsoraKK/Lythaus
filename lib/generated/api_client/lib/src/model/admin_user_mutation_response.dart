//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:built_collection/built_collection.dart';
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'admin_user_mutation_response.g.dart';

/// AdminUserMutationResponse
///
/// Properties:
/// * [userId]
/// * [status]
/// * [verificationState]
/// * [displayName]
/// * [handle]
@BuiltValue()
abstract class AdminUserMutationResponse implements Built<AdminUserMutationResponse, AdminUserMutationResponseBuilder> {
  @BuiltValueField(wireName: r'userId')
  String? get userId;

  @BuiltValueField(wireName: r'status')
  AdminUserMutationResponseStatusEnum? get status;
  // enum statusEnum {  active,  suspended,  locked,  };

  @BuiltValueField(wireName: r'verificationState')
  AdminUserMutationResponseVerificationStateEnum? get verificationState;
  // enum verificationStateEnum {  verified,  pending_verification,  };

  @BuiltValueField(wireName: r'displayName')
  String? get displayName;

  @BuiltValueField(wireName: r'handle')
  String? get handle;

  AdminUserMutationResponse._();

  factory AdminUserMutationResponse([void updates(AdminUserMutationResponseBuilder b)]) = _$AdminUserMutationResponse;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(AdminUserMutationResponseBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<AdminUserMutationResponse> get serializer => _$AdminUserMutationResponseSerializer();
}

class _$AdminUserMutationResponseSerializer implements PrimitiveSerializer<AdminUserMutationResponse> {
  @override
  final Iterable<Type> types = const [AdminUserMutationResponse, _$AdminUserMutationResponse];

  @override
  final String wireName = r'AdminUserMutationResponse';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    AdminUserMutationResponse object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    if (object.userId != null) {
      yield r'userId';
      yield serializers.serialize(
        object.userId,
        specifiedType: const FullType(String),
      );
    }
    if (object.status != null) {
      yield r'status';
      yield serializers.serialize(
        object.status,
        specifiedType: const FullType(AdminUserMutationResponseStatusEnum),
      );
    }
    if (object.verificationState != null) {
      yield r'verificationState';
      yield serializers.serialize(
        object.verificationState,
        specifiedType: const FullType(AdminUserMutationResponseVerificationStateEnum),
      );
    }
    if (object.displayName != null) {
      yield r'displayName';
      yield serializers.serialize(
        object.displayName,
        specifiedType: const FullType(String),
      );
    }
    if (object.handle != null) {
      yield r'handle';
      yield serializers.serialize(
        object.handle,
        specifiedType: const FullType.nullable(String),
      );
    }
  }

  @override
  Object serialize(
    Serializers serializers,
    AdminUserMutationResponse object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required AdminUserMutationResponseBuilder result,
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
        case r'status':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(AdminUserMutationResponseStatusEnum),
          ) as AdminUserMutationResponseStatusEnum;
          result.status = valueDes;
          break;
        case r'verificationState':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(AdminUserMutationResponseVerificationStateEnum),
          ) as AdminUserMutationResponseVerificationStateEnum;
          result.verificationState = valueDes;
          break;
        case r'displayName':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.displayName = valueDes;
          break;
        case r'handle':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType.nullable(String),
          ) as String?;
          if (valueDes == null) continue;
          result.handle = valueDes;
          break;
        default:
          unhandled.add(key);
          unhandled.add(value);
          break;
      }
    }
  }

  @override
  AdminUserMutationResponse deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = AdminUserMutationResponseBuilder();
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

class AdminUserMutationResponseStatusEnum extends EnumClass {

  @BuiltValueEnumConst(wireName: r'active')
  static const AdminUserMutationResponseStatusEnum active = _$adminUserMutationResponseStatusEnum_active;
  @BuiltValueEnumConst(wireName: r'suspended')
  static const AdminUserMutationResponseStatusEnum suspended = _$adminUserMutationResponseStatusEnum_suspended;
  @BuiltValueEnumConst(wireName: r'locked')
  static const AdminUserMutationResponseStatusEnum locked = _$adminUserMutationResponseStatusEnum_locked;

  static Serializer<AdminUserMutationResponseStatusEnum> get serializer => _$adminUserMutationResponseStatusEnumSerializer;

  const AdminUserMutationResponseStatusEnum._(String name): super(name);

  static BuiltSet<AdminUserMutationResponseStatusEnum> get values => _$adminUserMutationResponseStatusEnumValues;
  static AdminUserMutationResponseStatusEnum valueOf(String name) => _$adminUserMutationResponseStatusEnumValueOf(name);
}

class AdminUserMutationResponseVerificationStateEnum extends EnumClass {

  @BuiltValueEnumConst(wireName: r'verified')
  static const AdminUserMutationResponseVerificationStateEnum verified = _$adminUserMutationResponseVerificationStateEnum_verified;
  @BuiltValueEnumConst(wireName: r'pending_verification')
  static const AdminUserMutationResponseVerificationStateEnum pendingVerification = _$adminUserMutationResponseVerificationStateEnum_pendingVerification;

  static Serializer<AdminUserMutationResponseVerificationStateEnum> get serializer => _$adminUserMutationResponseVerificationStateEnumSerializer;

  const AdminUserMutationResponseVerificationStateEnum._(String name): super(name);

  static BuiltSet<AdminUserMutationResponseVerificationStateEnum> get values => _$adminUserMutationResponseVerificationStateEnumValues;
  static AdminUserMutationResponseVerificationStateEnum valueOf(String name) => _$adminUserMutationResponseVerificationStateEnumValueOf(name);
}
