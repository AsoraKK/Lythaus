//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:built_collection/built_collection.dart';
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'account_support_account.g.dart';

/// AccountSupportAccount
///
/// Properties:
/// * [id]
/// * [status]
/// * [verificationState]
/// * [verifiedAt]
/// * [createdAt]
/// * [updatedAt]
/// * [deletedAt]
/// * [lastSignInAt] - Last recorded email login, or null when unavailable; account creation is never substituted.
/// * [activeSessionCount]
/// * [subscriptionTier]
@BuiltValue()
abstract class AccountSupportAccount implements Built<AccountSupportAccount, AccountSupportAccountBuilder> {
  @BuiltValueField(wireName: r'id')
  String get id;

  @BuiltValueField(wireName: r'status')
  AccountSupportAccountStatusEnum get status;
  // enum statusEnum {  active,  suspended,  locked,  deleted,  relink_required,  };

  @BuiltValueField(wireName: r'verificationState')
  AccountSupportAccountVerificationStateEnum get verificationState;
  // enum verificationStateEnum {  verified,  pending_verification,  credential_setup_required,  };

  @BuiltValueField(wireName: r'verifiedAt')
  DateTime? get verifiedAt;

  @BuiltValueField(wireName: r'createdAt')
  DateTime get createdAt;

  @BuiltValueField(wireName: r'updatedAt')
  DateTime get updatedAt;

  @BuiltValueField(wireName: r'deletedAt')
  DateTime? get deletedAt;

  /// Last recorded email login, or null when unavailable; account creation is never substituted.
  @BuiltValueField(wireName: r'lastSignInAt')
  DateTime? get lastSignInAt;

  @BuiltValueField(wireName: r'activeSessionCount')
  int get activeSessionCount;

  @BuiltValueField(wireName: r'subscriptionTier')
  AccountSupportAccountSubscriptionTierEnum get subscriptionTier;
  // enum subscriptionTierEnum {  free,  premium,  black,  };

  AccountSupportAccount._();

  factory AccountSupportAccount([void updates(AccountSupportAccountBuilder b)]) = _$AccountSupportAccount;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(AccountSupportAccountBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<AccountSupportAccount> get serializer => _$AccountSupportAccountSerializer();
}

class _$AccountSupportAccountSerializer implements PrimitiveSerializer<AccountSupportAccount> {
  @override
  final Iterable<Type> types = const [AccountSupportAccount, _$AccountSupportAccount];

  @override
  final String wireName = r'AccountSupportAccount';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    AccountSupportAccount object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    yield r'id';
    yield serializers.serialize(
      object.id,
      specifiedType: const FullType(String),
    );
    yield r'status';
    yield serializers.serialize(
      object.status,
      specifiedType: const FullType(AccountSupportAccountStatusEnum),
    );
    yield r'verificationState';
    yield serializers.serialize(
      object.verificationState,
      specifiedType: const FullType(AccountSupportAccountVerificationStateEnum),
    );
    yield r'verifiedAt';
    yield object.verifiedAt == null ? null : serializers.serialize(
      object.verifiedAt,
      specifiedType: const FullType.nullable(DateTime),
    );
    yield r'createdAt';
    yield serializers.serialize(
      object.createdAt,
      specifiedType: const FullType(DateTime),
    );
    yield r'updatedAt';
    yield serializers.serialize(
      object.updatedAt,
      specifiedType: const FullType(DateTime),
    );
    yield r'deletedAt';
    yield object.deletedAt == null ? null : serializers.serialize(
      object.deletedAt,
      specifiedType: const FullType.nullable(DateTime),
    );
    yield r'lastSignInAt';
    yield object.lastSignInAt == null ? null : serializers.serialize(
      object.lastSignInAt,
      specifiedType: const FullType.nullable(DateTime),
    );
    yield r'activeSessionCount';
    yield serializers.serialize(
      object.activeSessionCount,
      specifiedType: const FullType(int),
    );
    yield r'subscriptionTier';
    yield serializers.serialize(
      object.subscriptionTier,
      specifiedType: const FullType(AccountSupportAccountSubscriptionTierEnum),
    );
  }

  @override
  Object serialize(
    Serializers serializers,
    AccountSupportAccount object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required AccountSupportAccountBuilder result,
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
        case r'status':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(AccountSupportAccountStatusEnum),
          ) as AccountSupportAccountStatusEnum;
          result.status = valueDes;
          break;
        case r'verificationState':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(AccountSupportAccountVerificationStateEnum),
          ) as AccountSupportAccountVerificationStateEnum;
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
            specifiedType: const FullType(DateTime),
          ) as DateTime;
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
        case r'lastSignInAt':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType.nullable(DateTime),
          ) as DateTime?;
          if (valueDes == null) continue;
          result.lastSignInAt = valueDes;
          break;
        case r'activeSessionCount':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(int),
          ) as int;
          result.activeSessionCount = valueDes;
          break;
        case r'subscriptionTier':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(AccountSupportAccountSubscriptionTierEnum),
          ) as AccountSupportAccountSubscriptionTierEnum;
          result.subscriptionTier = valueDes;
          break;
        default:
          unhandled.add(key);
          unhandled.add(value);
          break;
      }
    }
  }

  @override
  AccountSupportAccount deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = AccountSupportAccountBuilder();
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

class AccountSupportAccountStatusEnum extends EnumClass {

  @BuiltValueEnumConst(wireName: r'active')
  static const AccountSupportAccountStatusEnum active = _$accountSupportAccountStatusEnum_active;
  @BuiltValueEnumConst(wireName: r'suspended')
  static const AccountSupportAccountStatusEnum suspended = _$accountSupportAccountStatusEnum_suspended;
  @BuiltValueEnumConst(wireName: r'locked')
  static const AccountSupportAccountStatusEnum locked = _$accountSupportAccountStatusEnum_locked;
  @BuiltValueEnumConst(wireName: r'deleted')
  static const AccountSupportAccountStatusEnum deleted = _$accountSupportAccountStatusEnum_deleted;
  @BuiltValueEnumConst(wireName: r'relink_required')
  static const AccountSupportAccountStatusEnum relinkRequired = _$accountSupportAccountStatusEnum_relinkRequired;

  static Serializer<AccountSupportAccountStatusEnum> get serializer => _$accountSupportAccountStatusEnumSerializer;

  const AccountSupportAccountStatusEnum._(String name): super(name);

  static BuiltSet<AccountSupportAccountStatusEnum> get values => _$accountSupportAccountStatusEnumValues;
  static AccountSupportAccountStatusEnum valueOf(String name) => _$accountSupportAccountStatusEnumValueOf(name);
}

class AccountSupportAccountVerificationStateEnum extends EnumClass {

  @BuiltValueEnumConst(wireName: r'verified')
  static const AccountSupportAccountVerificationStateEnum verified = _$accountSupportAccountVerificationStateEnum_verified;
  @BuiltValueEnumConst(wireName: r'pending_verification')
  static const AccountSupportAccountVerificationStateEnum pendingVerification = _$accountSupportAccountVerificationStateEnum_pendingVerification;
  @BuiltValueEnumConst(wireName: r'credential_setup_required')
  static const AccountSupportAccountVerificationStateEnum credentialSetupRequired = _$accountSupportAccountVerificationStateEnum_credentialSetupRequired;

  static Serializer<AccountSupportAccountVerificationStateEnum> get serializer => _$accountSupportAccountVerificationStateEnumSerializer;

  const AccountSupportAccountVerificationStateEnum._(String name): super(name);

  static BuiltSet<AccountSupportAccountVerificationStateEnum> get values => _$accountSupportAccountVerificationStateEnumValues;
  static AccountSupportAccountVerificationStateEnum valueOf(String name) => _$accountSupportAccountVerificationStateEnumValueOf(name);
}

class AccountSupportAccountSubscriptionTierEnum extends EnumClass {

  @BuiltValueEnumConst(wireName: r'free')
  static const AccountSupportAccountSubscriptionTierEnum free = _$accountSupportAccountSubscriptionTierEnum_free;
  @BuiltValueEnumConst(wireName: r'premium')
  static const AccountSupportAccountSubscriptionTierEnum premium = _$accountSupportAccountSubscriptionTierEnum_premium;
  @BuiltValueEnumConst(wireName: r'black')
  static const AccountSupportAccountSubscriptionTierEnum black = _$accountSupportAccountSubscriptionTierEnum_black;

  static Serializer<AccountSupportAccountSubscriptionTierEnum> get serializer => _$accountSupportAccountSubscriptionTierEnumSerializer;

  const AccountSupportAccountSubscriptionTierEnum._(String name): super(name);

  static BuiltSet<AccountSupportAccountSubscriptionTierEnum> get values => _$accountSupportAccountSubscriptionTierEnumValues;
  static AccountSupportAccountSubscriptionTierEnum valueOf(String name) => _$accountSupportAccountSubscriptionTierEnumValueOf(name);
}
