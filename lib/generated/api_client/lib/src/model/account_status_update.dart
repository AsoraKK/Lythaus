//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:built_collection/built_collection.dart';
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'account_status_update.g.dart';

/// AccountStatusUpdate
///
/// Properties:
/// * [status]
/// * [reasonCode]
@BuiltValue()
abstract class AccountStatusUpdate implements Built<AccountStatusUpdate, AccountStatusUpdateBuilder> {
  @BuiltValueField(wireName: r'status')
  AccountStatusUpdateStatusEnum get status;
  // enum statusEnum {  active,  suspended,  locked,  };

  @BuiltValueField(wireName: r'reasonCode')
  String get reasonCode;

  AccountStatusUpdate._();

  factory AccountStatusUpdate([void updates(AccountStatusUpdateBuilder b)]) = _$AccountStatusUpdate;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(AccountStatusUpdateBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<AccountStatusUpdate> get serializer => _$AccountStatusUpdateSerializer();
}

class _$AccountStatusUpdateSerializer implements PrimitiveSerializer<AccountStatusUpdate> {
  @override
  final Iterable<Type> types = const [AccountStatusUpdate, _$AccountStatusUpdate];

  @override
  final String wireName = r'AccountStatusUpdate';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    AccountStatusUpdate object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    yield r'status';
    yield serializers.serialize(
      object.status,
      specifiedType: const FullType(AccountStatusUpdateStatusEnum),
    );
    yield r'reasonCode';
    yield serializers.serialize(
      object.reasonCode,
      specifiedType: const FullType(String),
    );
  }

  @override
  Object serialize(
    Serializers serializers,
    AccountStatusUpdate object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required AccountStatusUpdateBuilder result,
    required List<Object?> unhandled,
  }) {
    for (var i = 0; i < serializedList.length; i += 2) {
      final key = serializedList[i] as String;
      final value = serializedList[i + 1];
      switch (key) {
        case r'status':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(AccountStatusUpdateStatusEnum),
          ) as AccountStatusUpdateStatusEnum;
          result.status = valueDes;
          break;
        case r'reasonCode':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.reasonCode = valueDes;
          break;
        default:
          unhandled.add(key);
          unhandled.add(value);
          break;
      }
    }
  }

  @override
  AccountStatusUpdate deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = AccountStatusUpdateBuilder();
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

class AccountStatusUpdateStatusEnum extends EnumClass {

  @BuiltValueEnumConst(wireName: r'active')
  static const AccountStatusUpdateStatusEnum active = _$accountStatusUpdateStatusEnum_active;
  @BuiltValueEnumConst(wireName: r'suspended')
  static const AccountStatusUpdateStatusEnum suspended = _$accountStatusUpdateStatusEnum_suspended;
  @BuiltValueEnumConst(wireName: r'locked')
  static const AccountStatusUpdateStatusEnum locked = _$accountStatusUpdateStatusEnum_locked;

  static Serializer<AccountStatusUpdateStatusEnum> get serializer => _$accountStatusUpdateStatusEnumSerializer;

  const AccountStatusUpdateStatusEnum._(String name): super(name);

  static BuiltSet<AccountStatusUpdateStatusEnum> get values => _$accountStatusUpdateStatusEnumValues;
  static AccountStatusUpdateStatusEnum valueOf(String name) => _$accountStatusUpdateStatusEnumValueOf(name);
}
