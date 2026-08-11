//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:built_collection/built_collection.dart';
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'auth_user_info200_response.g.dart';

/// AuthUserInfo200Response
///
/// Properties:
/// * [id]
/// * [sub]
/// * [email]
/// * [role]
/// * [subscriptionTier]
/// * [reputationLevel]
/// * [reputationPolicyVersion]
/// * [createdAt]
/// * [lastLoginAt]
@BuiltValue()
abstract class AuthUserInfo200Response implements Built<AuthUserInfo200Response, AuthUserInfo200ResponseBuilder> {
  @BuiltValueField(wireName: r'id')
  String get id;

  @BuiltValueField(wireName: r'sub')
  String get sub;

  @BuiltValueField(wireName: r'email')
  String get email;

  @BuiltValueField(wireName: r'role')
  AuthUserInfo200ResponseRoleEnum get role;
  // enum roleEnum {  user,  moderator,  admin,  };

  @BuiltValueField(wireName: r'subscription_tier')
  AuthUserInfo200ResponseSubscriptionTierEnum get subscriptionTier;
  // enum subscriptionTierEnum {  free,  premium,  black,  };

  @BuiltValueField(wireName: r'reputation_level')
  int get reputationLevel;

  @BuiltValueField(wireName: r'reputation_policy_version')
  String get reputationPolicyVersion;

  @BuiltValueField(wireName: r'created_at')
  DateTime get createdAt;

  @BuiltValueField(wireName: r'last_login_at')
  DateTime get lastLoginAt;

  AuthUserInfo200Response._();

  factory AuthUserInfo200Response([void updates(AuthUserInfo200ResponseBuilder b)]) = _$AuthUserInfo200Response;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(AuthUserInfo200ResponseBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<AuthUserInfo200Response> get serializer => _$AuthUserInfo200ResponseSerializer();
}

class _$AuthUserInfo200ResponseSerializer implements PrimitiveSerializer<AuthUserInfo200Response> {
  @override
  final Iterable<Type> types = const [AuthUserInfo200Response, _$AuthUserInfo200Response];

  @override
  final String wireName = r'AuthUserInfo200Response';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    AuthUserInfo200Response object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    yield r'id';
    yield serializers.serialize(
      object.id,
      specifiedType: const FullType(String),
    );
    yield r'sub';
    yield serializers.serialize(
      object.sub,
      specifiedType: const FullType(String),
    );
    yield r'email';
    yield serializers.serialize(
      object.email,
      specifiedType: const FullType(String),
    );
    yield r'role';
    yield serializers.serialize(
      object.role,
      specifiedType: const FullType(AuthUserInfo200ResponseRoleEnum),
    );
    yield r'subscription_tier';
    yield serializers.serialize(
      object.subscriptionTier,
      specifiedType: const FullType(AuthUserInfo200ResponseSubscriptionTierEnum),
    );
    yield r'reputation_level';
    yield serializers.serialize(
      object.reputationLevel,
      specifiedType: const FullType(int),
    );
    yield r'reputation_policy_version';
    yield serializers.serialize(
      object.reputationPolicyVersion,
      specifiedType: const FullType(String),
    );
    yield r'created_at';
    yield serializers.serialize(
      object.createdAt,
      specifiedType: const FullType(DateTime),
    );
    yield r'last_login_at';
    yield serializers.serialize(
      object.lastLoginAt,
      specifiedType: const FullType(DateTime),
    );
  }

  @override
  Object serialize(
    Serializers serializers,
    AuthUserInfo200Response object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required AuthUserInfo200ResponseBuilder result,
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
        case r'sub':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.sub = valueDes;
          break;
        case r'email':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.email = valueDes;
          break;
        case r'role':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(AuthUserInfo200ResponseRoleEnum),
          ) as AuthUserInfo200ResponseRoleEnum;
          result.role = valueDes;
          break;
        case r'subscription_tier':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(AuthUserInfo200ResponseSubscriptionTierEnum),
          ) as AuthUserInfo200ResponseSubscriptionTierEnum;
          result.subscriptionTier = valueDes;
          break;
        case r'reputation_level':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(int),
          ) as int;
          result.reputationLevel = valueDes;
          break;
        case r'reputation_policy_version':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.reputationPolicyVersion = valueDes;
          break;
        case r'created_at':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(DateTime),
          ) as DateTime;
          result.createdAt = valueDes;
          break;
        case r'last_login_at':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(DateTime),
          ) as DateTime;
          result.lastLoginAt = valueDes;
          break;
        default:
          unhandled.add(key);
          unhandled.add(value);
          break;
      }
    }
  }

  @override
  AuthUserInfo200Response deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = AuthUserInfo200ResponseBuilder();
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

class AuthUserInfo200ResponseRoleEnum extends EnumClass {

  @BuiltValueEnumConst(wireName: r'user')
  static const AuthUserInfo200ResponseRoleEnum user = _$authUserInfo200ResponseRoleEnum_user;
  @BuiltValueEnumConst(wireName: r'moderator')
  static const AuthUserInfo200ResponseRoleEnum moderator = _$authUserInfo200ResponseRoleEnum_moderator;
  @BuiltValueEnumConst(wireName: r'admin')
  static const AuthUserInfo200ResponseRoleEnum admin = _$authUserInfo200ResponseRoleEnum_admin;

  static Serializer<AuthUserInfo200ResponseRoleEnum> get serializer => _$authUserInfo200ResponseRoleEnumSerializer;

  const AuthUserInfo200ResponseRoleEnum._(String name): super(name);

  static BuiltSet<AuthUserInfo200ResponseRoleEnum> get values => _$authUserInfo200ResponseRoleEnumValues;
  static AuthUserInfo200ResponseRoleEnum valueOf(String name) => _$authUserInfo200ResponseRoleEnumValueOf(name);
}

class AuthUserInfo200ResponseSubscriptionTierEnum extends EnumClass {

  @BuiltValueEnumConst(wireName: r'free')
  static const AuthUserInfo200ResponseSubscriptionTierEnum free = _$authUserInfo200ResponseSubscriptionTierEnum_free;
  @BuiltValueEnumConst(wireName: r'premium')
  static const AuthUserInfo200ResponseSubscriptionTierEnum premium = _$authUserInfo200ResponseSubscriptionTierEnum_premium;
  @BuiltValueEnumConst(wireName: r'black')
  static const AuthUserInfo200ResponseSubscriptionTierEnum black = _$authUserInfo200ResponseSubscriptionTierEnum_black;

  static Serializer<AuthUserInfo200ResponseSubscriptionTierEnum> get serializer => _$authUserInfo200ResponseSubscriptionTierEnumSerializer;

  const AuthUserInfo200ResponseSubscriptionTierEnum._(String name): super(name);

  static BuiltSet<AuthUserInfo200ResponseSubscriptionTierEnum> get values => _$authUserInfo200ResponseSubscriptionTierEnumValues;
  static AuthUserInfo200ResponseSubscriptionTierEnum valueOf(String name) => _$authUserInfo200ResponseSubscriptionTierEnumValueOf(name);
}
