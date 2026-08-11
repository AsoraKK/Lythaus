//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:built_collection/built_collection.dart';
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'account_tier_response.g.dart';

/// AccountTierResponse
///
/// Properties:
/// * [userId]
/// * [tier]
@BuiltValue()
abstract class AccountTierResponse implements Built<AccountTierResponse, AccountTierResponseBuilder> {
  @BuiltValueField(wireName: r'userId')
  String get userId;

  @BuiltValueField(wireName: r'tier')
  AccountTierResponseTierEnum get tier;
  // enum tierEnum {  free,  premium,  black,  };

  AccountTierResponse._();

  factory AccountTierResponse([void updates(AccountTierResponseBuilder b)]) = _$AccountTierResponse;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(AccountTierResponseBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<AccountTierResponse> get serializer => _$AccountTierResponseSerializer();
}

class _$AccountTierResponseSerializer implements PrimitiveSerializer<AccountTierResponse> {
  @override
  final Iterable<Type> types = const [AccountTierResponse, _$AccountTierResponse];

  @override
  final String wireName = r'AccountTierResponse';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    AccountTierResponse object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    yield r'userId';
    yield serializers.serialize(
      object.userId,
      specifiedType: const FullType(String),
    );
    yield r'tier';
    yield serializers.serialize(
      object.tier,
      specifiedType: const FullType(AccountTierResponseTierEnum),
    );
  }

  @override
  Object serialize(
    Serializers serializers,
    AccountTierResponse object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required AccountTierResponseBuilder result,
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
        case r'tier':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(AccountTierResponseTierEnum),
          ) as AccountTierResponseTierEnum;
          result.tier = valueDes;
          break;
        default:
          unhandled.add(key);
          unhandled.add(value);
          break;
      }
    }
  }

  @override
  AccountTierResponse deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = AccountTierResponseBuilder();
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

class AccountTierResponseTierEnum extends EnumClass {

  @BuiltValueEnumConst(wireName: r'free')
  static const AccountTierResponseTierEnum free = _$accountTierResponseTierEnum_free;
  @BuiltValueEnumConst(wireName: r'premium')
  static const AccountTierResponseTierEnum premium = _$accountTierResponseTierEnum_premium;
  @BuiltValueEnumConst(wireName: r'black')
  static const AccountTierResponseTierEnum black = _$accountTierResponseTierEnum_black;

  static Serializer<AccountTierResponseTierEnum> get serializer => _$accountTierResponseTierEnumSerializer;

  const AccountTierResponseTierEnum._(String name): super(name);

  static BuiltSet<AccountTierResponseTierEnum> get values => _$accountTierResponseTierEnumValues;
  static AccountTierResponseTierEnum valueOf(String name) => _$accountTierResponseTierEnumValueOf(name);
}
