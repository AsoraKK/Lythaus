//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:built_collection/built_collection.dart';
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'waitlist_admin_item_linked_account.g.dart';

/// WaitlistAdminItemLinkedAccount
///
/// Properties:
/// * [id]
/// * [status]
@BuiltValue()
abstract class WaitlistAdminItemLinkedAccount implements Built<WaitlistAdminItemLinkedAccount, WaitlistAdminItemLinkedAccountBuilder> {
  @BuiltValueField(wireName: r'id')
  String? get id;

  @BuiltValueField(wireName: r'status')
  WaitlistAdminItemLinkedAccountStatusEnum? get status;
  // enum statusEnum {  active,  suspended,  deleted,  locked,  relink_required,  };

  WaitlistAdminItemLinkedAccount._();

  factory WaitlistAdminItemLinkedAccount([void updates(WaitlistAdminItemLinkedAccountBuilder b)]) = _$WaitlistAdminItemLinkedAccount;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(WaitlistAdminItemLinkedAccountBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<WaitlistAdminItemLinkedAccount> get serializer => _$WaitlistAdminItemLinkedAccountSerializer();
}

class _$WaitlistAdminItemLinkedAccountSerializer implements PrimitiveSerializer<WaitlistAdminItemLinkedAccount> {
  @override
  final Iterable<Type> types = const [WaitlistAdminItemLinkedAccount, _$WaitlistAdminItemLinkedAccount];

  @override
  final String wireName = r'WaitlistAdminItemLinkedAccount';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    WaitlistAdminItemLinkedAccount object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    if (object.id != null) {
      yield r'id';
      yield serializers.serialize(
        object.id,
        specifiedType: const FullType(String),
      );
    }
    if (object.status != null) {
      yield r'status';
      yield serializers.serialize(
        object.status,
        specifiedType: const FullType(WaitlistAdminItemLinkedAccountStatusEnum),
      );
    }
  }

  @override
  Object serialize(
    Serializers serializers,
    WaitlistAdminItemLinkedAccount object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required WaitlistAdminItemLinkedAccountBuilder result,
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
            specifiedType: const FullType(WaitlistAdminItemLinkedAccountStatusEnum),
          ) as WaitlistAdminItemLinkedAccountStatusEnum;
          result.status = valueDes;
          break;
        default:
          unhandled.add(key);
          unhandled.add(value);
          break;
      }
    }
  }

  @override
  WaitlistAdminItemLinkedAccount deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = WaitlistAdminItemLinkedAccountBuilder();
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

class WaitlistAdminItemLinkedAccountStatusEnum extends EnumClass {

  @BuiltValueEnumConst(wireName: r'active')
  static const WaitlistAdminItemLinkedAccountStatusEnum active = _$waitlistAdminItemLinkedAccountStatusEnum_active;
  @BuiltValueEnumConst(wireName: r'suspended')
  static const WaitlistAdminItemLinkedAccountStatusEnum suspended = _$waitlistAdminItemLinkedAccountStatusEnum_suspended;
  @BuiltValueEnumConst(wireName: r'deleted')
  static const WaitlistAdminItemLinkedAccountStatusEnum deleted = _$waitlistAdminItemLinkedAccountStatusEnum_deleted;
  @BuiltValueEnumConst(wireName: r'locked')
  static const WaitlistAdminItemLinkedAccountStatusEnum locked = _$waitlistAdminItemLinkedAccountStatusEnum_locked;
  @BuiltValueEnumConst(wireName: r'relink_required')
  static const WaitlistAdminItemLinkedAccountStatusEnum relinkRequired = _$waitlistAdminItemLinkedAccountStatusEnum_relinkRequired;

  static Serializer<WaitlistAdminItemLinkedAccountStatusEnum> get serializer => _$waitlistAdminItemLinkedAccountStatusEnumSerializer;

  const WaitlistAdminItemLinkedAccountStatusEnum._(String name): super(name);

  static BuiltSet<WaitlistAdminItemLinkedAccountStatusEnum> get values => _$waitlistAdminItemLinkedAccountStatusEnumValues;
  static WaitlistAdminItemLinkedAccountStatusEnum valueOf(String name) => _$waitlistAdminItemLinkedAccountStatusEnumValueOf(name);
}
