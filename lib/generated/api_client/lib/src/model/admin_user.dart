//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:built_collection/built_collection.dart';
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'admin_user.g.dart';

/// AdminUser
///
/// Properties:
/// * [id]
/// * [email]
/// * [displayName]
/// * [handle]
/// * [status]
/// * [verificationState]
/// * [verifiedAt]
/// * [emailStatus] - Safe canonical relay state only; provider identifiers and raw errors are never returned.
/// * [source_]
/// * [subscriptionTier]
/// * [createdAt]
/// * [updatedAt]
/// * [deletedAt]
/// * [lastLoginAt]
/// * [currentSessionCount]
@BuiltValue()
abstract class AdminUser implements Built<AdminUser, AdminUserBuilder> {
  @BuiltValueField(wireName: r'id')
  String get id;

  @BuiltValueField(wireName: r'email')
  String? get email;

  @BuiltValueField(wireName: r'displayName')
  String get displayName;

  @BuiltValueField(wireName: r'handle')
  String? get handle;

  @BuiltValueField(wireName: r'status')
  AdminUserStatusEnum get status;
  // enum statusEnum {  active,  suspended,  locked,  relink_required,  deleted,  };

  @BuiltValueField(wireName: r'verificationState')
  AdminUserVerificationStateEnum get verificationState;
  // enum verificationStateEnum {  verified,  pending_verification,  };

  @BuiltValueField(wireName: r'verifiedAt')
  DateTime? get verifiedAt;

  /// Safe canonical relay state only; provider identifiers and raw errors are never returned.
  @BuiltValueField(wireName: r'emailStatus')
  String? get emailStatus;

  @BuiltValueField(wireName: r'source')
  String? get source_;

  @BuiltValueField(wireName: r'subscriptionTier')
  AdminUserSubscriptionTierEnum? get subscriptionTier;
  // enum subscriptionTierEnum {  free,  premium,  black,  };

  @BuiltValueField(wireName: r'createdAt')
  DateTime get createdAt;

  @BuiltValueField(wireName: r'updatedAt')
  DateTime? get updatedAt;

  @BuiltValueField(wireName: r'deletedAt')
  DateTime? get deletedAt;

  @BuiltValueField(wireName: r'lastLoginAt')
  DateTime? get lastLoginAt;

  @BuiltValueField(wireName: r'currentSessionCount')
  int get currentSessionCount;

  AdminUser._();

  factory AdminUser([void updates(AdminUserBuilder b)]) = _$AdminUser;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(AdminUserBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<AdminUser> get serializer => _$AdminUserSerializer();
}

class _$AdminUserSerializer implements PrimitiveSerializer<AdminUser> {
  @override
  final Iterable<Type> types = const [AdminUser, _$AdminUser];

  @override
  final String wireName = r'AdminUser';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    AdminUser object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    yield r'id';
    yield serializers.serialize(
      object.id,
      specifiedType: const FullType(String),
    );
    yield r'email';
    yield object.email == null ? null : serializers.serialize(
      object.email,
      specifiedType: const FullType.nullable(String),
    );
    yield r'displayName';
    yield serializers.serialize(
      object.displayName,
      specifiedType: const FullType(String),
    );
    if (object.handle != null) {
      yield r'handle';
      yield serializers.serialize(
        object.handle,
        specifiedType: const FullType.nullable(String),
      );
    }
    yield r'status';
    yield serializers.serialize(
      object.status,
      specifiedType: const FullType(AdminUserStatusEnum),
    );
    yield r'verificationState';
    yield serializers.serialize(
      object.verificationState,
      specifiedType: const FullType(AdminUserVerificationStateEnum),
    );
    yield r'verifiedAt';
    yield object.verifiedAt == null ? null : serializers.serialize(
      object.verifiedAt,
      specifiedType: const FullType.nullable(DateTime),
    );
    yield r'emailStatus';
    yield object.emailStatus == null ? null : serializers.serialize(
      object.emailStatus,
      specifiedType: const FullType.nullable(String),
    );
    if (object.source_ != null) {
      yield r'source';
      yield serializers.serialize(
        object.source_,
        specifiedType: const FullType.nullable(String),
      );
    }
    if (object.subscriptionTier != null) {
      yield r'subscriptionTier';
      yield serializers.serialize(
        object.subscriptionTier,
        specifiedType: const FullType(AdminUserSubscriptionTierEnum),
      );
    }
    yield r'createdAt';
    yield serializers.serialize(
      object.createdAt,
      specifiedType: const FullType(DateTime),
    );
    if (object.updatedAt != null) {
      yield r'updatedAt';
      yield serializers.serialize(
        object.updatedAt,
        specifiedType: const FullType.nullable(DateTime),
      );
    }
    if (object.deletedAt != null) {
      yield r'deletedAt';
      yield serializers.serialize(
        object.deletedAt,
        specifiedType: const FullType.nullable(DateTime),
      );
    }
    if (object.lastLoginAt != null) {
      yield r'lastLoginAt';
      yield serializers.serialize(
        object.lastLoginAt,
        specifiedType: const FullType.nullable(DateTime),
      );
    }
    yield r'currentSessionCount';
    yield serializers.serialize(
      object.currentSessionCount,
      specifiedType: const FullType(int),
    );
  }

  @override
  Object serialize(
    Serializers serializers,
    AdminUser object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required AdminUserBuilder result,
    required List<Object?> unhandled,
  }) {
    for (var i = 0; i < serializedList.length; i += 2) {
      final key = serializedList[i] as String;
      final value = serializedList[i + 1];
      switch (key) {
        case r'id':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.id = valueDes;
          break;
        case r'email':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType.nullable(String),
          ) as String?;
          if (valueDes == null) continue;
          result.email = valueDes;
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
        case r'status':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(AdminUserStatusEnum),
          ) as AdminUserStatusEnum;
          result.status = valueDes;
          break;
        case r'verificationState':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(AdminUserVerificationStateEnum),
          ) as AdminUserVerificationStateEnum;
          result.verificationState = valueDes;
          break;
        case r'verifiedAt':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType.nullable(DateTime),
          ) as DateTime?;
          if (valueDes == null) continue;
          result.verifiedAt = valueDes;
          break;
        case r'emailStatus':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType.nullable(String),
          ) as String?;
          if (valueDes == null) continue;
          result.emailStatus = valueDes;
          break;
        case r'source':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType.nullable(String),
          ) as String?;
          if (valueDes == null) continue;
          result.source_ = valueDes;
          break;
        case r'subscriptionTier':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(AdminUserSubscriptionTierEnum),
          ) as AdminUserSubscriptionTierEnum;
          result.subscriptionTier = valueDes;
          break;
        case r'createdAt':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(DateTime),
          ) as DateTime;
          result.createdAt = valueDes;
          break;
        case r'updatedAt':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType.nullable(DateTime),
          ) as DateTime?;
          if (valueDes == null) continue;
          result.updatedAt = valueDes;
          break;
        case r'deletedAt':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType.nullable(DateTime),
          ) as DateTime?;
          if (valueDes == null) continue;
          result.deletedAt = valueDes;
          break;
        case r'lastLoginAt':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType.nullable(DateTime),
          ) as DateTime?;
          if (valueDes == null) continue;
          result.lastLoginAt = valueDes;
          break;
        case r'currentSessionCount':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(int),
          ) as int;
          result.currentSessionCount = valueDes;
          break;
        default:
          unhandled.add(key);
          unhandled.add(value);
          break;
      }
    }
  }

  @override
  AdminUser deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = AdminUserBuilder();
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

class AdminUserStatusEnum extends EnumClass {

  @BuiltValueEnumConst(wireName: r'active')
  static const AdminUserStatusEnum active = _$adminUserStatusEnum_active;
  @BuiltValueEnumConst(wireName: r'suspended')
  static const AdminUserStatusEnum suspended = _$adminUserStatusEnum_suspended;
  @BuiltValueEnumConst(wireName: r'locked')
  static const AdminUserStatusEnum locked = _$adminUserStatusEnum_locked;
  @BuiltValueEnumConst(wireName: r'relink_required')
  static const AdminUserStatusEnum relinkRequired = _$adminUserStatusEnum_relinkRequired;
  @BuiltValueEnumConst(wireName: r'deleted')
  static const AdminUserStatusEnum deleted = _$adminUserStatusEnum_deleted;

  static Serializer<AdminUserStatusEnum> get serializer => _$adminUserStatusEnumSerializer;

  const AdminUserStatusEnum._(String name): super(name);

  static BuiltSet<AdminUserStatusEnum> get values => _$adminUserStatusEnumValues;
  static AdminUserStatusEnum valueOf(String name) => _$adminUserStatusEnumValueOf(name);
}

class AdminUserVerificationStateEnum extends EnumClass {

  @BuiltValueEnumConst(wireName: r'verified')
  static const AdminUserVerificationStateEnum verified = _$adminUserVerificationStateEnum_verified;
  @BuiltValueEnumConst(wireName: r'pending_verification')
  static const AdminUserVerificationStateEnum pendingVerification = _$adminUserVerificationStateEnum_pendingVerification;

  static Serializer<AdminUserVerificationStateEnum> get serializer => _$adminUserVerificationStateEnumSerializer;

  const AdminUserVerificationStateEnum._(String name): super(name);

  static BuiltSet<AdminUserVerificationStateEnum> get values => _$adminUserVerificationStateEnumValues;
  static AdminUserVerificationStateEnum valueOf(String name) => _$adminUserVerificationStateEnumValueOf(name);
}

class AdminUserSubscriptionTierEnum extends EnumClass {

  @BuiltValueEnumConst(wireName: r'free')
  static const AdminUserSubscriptionTierEnum free = _$adminUserSubscriptionTierEnum_free;
  @BuiltValueEnumConst(wireName: r'premium')
  static const AdminUserSubscriptionTierEnum premium = _$adminUserSubscriptionTierEnum_premium;
  @BuiltValueEnumConst(wireName: r'black')
  static const AdminUserSubscriptionTierEnum black = _$adminUserSubscriptionTierEnum_black;

  static Serializer<AdminUserSubscriptionTierEnum> get serializer => _$adminUserSubscriptionTierEnumSerializer;

  const AdminUserSubscriptionTierEnum._(String name): super(name);

  static BuiltSet<AdminUserSubscriptionTierEnum> get values => _$adminUserSubscriptionTierEnumValues;
  static AdminUserSubscriptionTierEnum valueOf(String name) => _$adminUserSubscriptionTierEnumValueOf(name);
}
