//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:built_collection/built_collection.dart';
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'account_tier_update.g.dart';

/// AccountTierUpdate
///
/// Properties:
/// * [tier]
/// * [reasonCode]
@BuiltValue()
abstract class AccountTierUpdate implements Built<AccountTierUpdate, AccountTierUpdateBuilder> {
  @BuiltValueField(wireName: r'tier')
  AccountTierUpdateTierEnum get tier;
  // enum tierEnum {  free,  premium,  black,  };

  @BuiltValueField(wireName: r'reasonCode')
  String get reasonCode;

  AccountTierUpdate._();

  factory AccountTierUpdate([void updates(AccountTierUpdateBuilder b)]) = _$AccountTierUpdate;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(AccountTierUpdateBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<AccountTierUpdate> get serializer => _$AccountTierUpdateSerializer();
}

class _$AccountTierUpdateSerializer implements PrimitiveSerializer<AccountTierUpdate> {
  @override
  final Iterable<Type> types = const [AccountTierUpdate, _$AccountTierUpdate];

  @override
  final String wireName = r'AccountTierUpdate';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    AccountTierUpdate object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    yield r'tier';
    yield serializers.serialize(
      object.tier,
      specifiedType: const FullType(AccountTierUpdateTierEnum),
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
    AccountTierUpdate object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required AccountTierUpdateBuilder result,
    required List<Object?> unhandled,
  }) {
    for (var i = 0; i < serializedList.length; i += 2) {
      final key = serializedList[i] as String;
      final value = serializedList[i + 1];
      switch (key) {
        case r'tier':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(AccountTierUpdateTierEnum),
          ) as AccountTierUpdateTierEnum;
          result.tier = valueDes;
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
  AccountTierUpdate deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = AccountTierUpdateBuilder();
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

class AccountTierUpdateTierEnum extends EnumClass {

  @BuiltValueEnumConst(wireName: r'free')
  static const AccountTierUpdateTierEnum free = _$accountTierUpdateTierEnum_free;
  @BuiltValueEnumConst(wireName: r'premium')
  static const AccountTierUpdateTierEnum premium = _$accountTierUpdateTierEnum_premium;
  @BuiltValueEnumConst(wireName: r'black')
  static const AccountTierUpdateTierEnum black = _$accountTierUpdateTierEnum_black;

  static Serializer<AccountTierUpdateTierEnum> get serializer => _$accountTierUpdateTierEnumSerializer;

  const AccountTierUpdateTierEnum._(String name): super(name);

  static BuiltSet<AccountTierUpdateTierEnum> get values => _$accountTierUpdateTierEnumValues;
  static AccountTierUpdateTierEnum valueOf(String name) => _$accountTierUpdateTierEnumValueOf(name);
}
