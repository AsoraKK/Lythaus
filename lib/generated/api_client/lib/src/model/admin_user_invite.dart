//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:built_collection/built_collection.dart';
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'admin_user_invite.g.dart';

/// AdminUserInvite
///
/// Properties:
/// * [email]
/// * [displayName]
/// * [handle]
/// * [reasonCode]
/// * [confirmation]
@BuiltValue()
abstract class AdminUserInvite implements Built<AdminUserInvite, AdminUserInviteBuilder> {
  @BuiltValueField(wireName: r'email')
  String get email;

  @BuiltValueField(wireName: r'displayName')
  String? get displayName;

  @BuiltValueField(wireName: r'handle')
  String? get handle;

  @BuiltValueField(wireName: r'reasonCode')
  String get reasonCode;

  @BuiltValueField(wireName: r'confirmation')
  AdminUserInviteConfirmationEnum get confirmation;
  // enum confirmationEnum {  INVITE ACCOUNT,  };

  AdminUserInvite._();

  factory AdminUserInvite([void updates(AdminUserInviteBuilder b)]) = _$AdminUserInvite;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(AdminUserInviteBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<AdminUserInvite> get serializer => _$AdminUserInviteSerializer();
}

class _$AdminUserInviteSerializer implements PrimitiveSerializer<AdminUserInvite> {
  @override
  final Iterable<Type> types = const [AdminUserInvite, _$AdminUserInvite];

  @override
  final String wireName = r'AdminUserInvite';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    AdminUserInvite object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    yield r'email';
    yield serializers.serialize(
      object.email,
      specifiedType: const FullType(String),
    );
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
        specifiedType: const FullType(String),
      );
    }
    yield r'reasonCode';
    yield serializers.serialize(
      object.reasonCode,
      specifiedType: const FullType(String),
    );
    yield r'confirmation';
    yield serializers.serialize(
      object.confirmation,
      specifiedType: const FullType(AdminUserInviteConfirmationEnum),
    );
  }

  @override
  Object serialize(
    Serializers serializers,
    AdminUserInvite object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required AdminUserInviteBuilder result,
    required List<Object?> unhandled,
  }) {
    for (var i = 0; i < serializedList.length; i += 2) {
      final key = serializedList[i] as String;
      final value = serializedList[i + 1];
      switch (key) {
        case r'email':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
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
            specifiedType: const FullType(String),
          ) as String;
          result.handle = valueDes;
          break;
        case r'reasonCode':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.reasonCode = valueDes;
          break;
        case r'confirmation':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(AdminUserInviteConfirmationEnum),
          ) as AdminUserInviteConfirmationEnum;
          result.confirmation = valueDes;
          break;
        default:
          unhandled.add(key);
          unhandled.add(value);
          break;
      }
    }
  }

  @override
  AdminUserInvite deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = AdminUserInviteBuilder();
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

class AdminUserInviteConfirmationEnum extends EnumClass {

  @BuiltValueEnumConst(wireName: r'INVITE ACCOUNT')
  static const AdminUserInviteConfirmationEnum iNVITEACCOUNT = _$adminUserInviteConfirmationEnum_iNVITEACCOUNT;

  static Serializer<AdminUserInviteConfirmationEnum> get serializer => _$adminUserInviteConfirmationEnumSerializer;

  const AdminUserInviteConfirmationEnum._(String name): super(name);

  static BuiltSet<AdminUserInviteConfirmationEnum> get values => _$adminUserInviteConfirmationEnumValues;
  static AdminUserInviteConfirmationEnum valueOf(String name) => _$adminUserInviteConfirmationEnumValueOf(name);
}
