//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:lythaus_api_client/src/model/account_support_account.dart';
import 'package:built_collection/built_collection.dart';
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'account_support_lookup_response.g.dart';

/// Account is present only for found; not_found and ambiguous always return null.
///
/// Properties:
/// * [state]
/// * [account]
/// * [correlationId]
@BuiltValue()
abstract class AccountSupportLookupResponse implements Built<AccountSupportLookupResponse, AccountSupportLookupResponseBuilder> {
  @BuiltValueField(wireName: r'state')
  AccountSupportLookupResponseStateEnum get state;
  // enum stateEnum {  found,  not_found,  ambiguous,  };

  @BuiltValueField(wireName: r'account')
  AccountSupportAccount? get account;

  @BuiltValueField(wireName: r'correlationId')
  String get correlationId;

  AccountSupportLookupResponse._();

  factory AccountSupportLookupResponse([void updates(AccountSupportLookupResponseBuilder b)]) = _$AccountSupportLookupResponse;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(AccountSupportLookupResponseBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<AccountSupportLookupResponse> get serializer => _$AccountSupportLookupResponseSerializer();
}

class _$AccountSupportLookupResponseSerializer implements PrimitiveSerializer<AccountSupportLookupResponse> {
  @override
  final Iterable<Type> types = const [AccountSupportLookupResponse, _$AccountSupportLookupResponse];

  @override
  final String wireName = r'AccountSupportLookupResponse';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    AccountSupportLookupResponse object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    yield r'state';
    yield serializers.serialize(
      object.state,
      specifiedType: const FullType(AccountSupportLookupResponseStateEnum),
    );
    yield r'account';
    yield object.account == null ? null : serializers.serialize(
      object.account,
      specifiedType: const FullType.nullable(AccountSupportAccount),
    );
    yield r'correlationId';
    yield serializers.serialize(
      object.correlationId,
      specifiedType: const FullType(String),
    );
  }

  @override
  Object serialize(
    Serializers serializers,
    AccountSupportLookupResponse object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required AccountSupportLookupResponseBuilder result,
    required List<Object?> unhandled,
  }) {
    for (var i = 0; i < serializedList.length; i += 2) {
      final key = serializedList[i] as String;
      final value = serializedList[i + 1];
      switch (key) {
        case r'state':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(AccountSupportLookupResponseStateEnum),
          ) as AccountSupportLookupResponseStateEnum;
          result.state = valueDes;
          break;
        case r'account':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType.nullable(AccountSupportAccount),
          ) as AccountSupportAccount?;
          if (valueDes == null) continue;
          result.account.replace(valueDes);
          break;
        case r'correlationId':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.correlationId = valueDes;
          break;
        default:
          unhandled.add(key);
          unhandled.add(value);
          break;
      }
    }
  }

  @override
  AccountSupportLookupResponse deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = AccountSupportLookupResponseBuilder();
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

class AccountSupportLookupResponseStateEnum extends EnumClass {

  @BuiltValueEnumConst(wireName: r'found')
  static const AccountSupportLookupResponseStateEnum found = _$accountSupportLookupResponseStateEnum_found;
  @BuiltValueEnumConst(wireName: r'not_found')
  static const AccountSupportLookupResponseStateEnum notFound = _$accountSupportLookupResponseStateEnum_notFound;
  @BuiltValueEnumConst(wireName: r'ambiguous')
  static const AccountSupportLookupResponseStateEnum ambiguous = _$accountSupportLookupResponseStateEnum_ambiguous;

  static Serializer<AccountSupportLookupResponseStateEnum> get serializer => _$accountSupportLookupResponseStateEnumSerializer;

  const AccountSupportLookupResponseStateEnum._(String name): super(name);

  static BuiltSet<AccountSupportLookupResponseStateEnum> get values => _$accountSupportLookupResponseStateEnumValues;
  static AccountSupportLookupResponseStateEnum valueOf(String name) => _$accountSupportLookupResponseStateEnumValueOf(name);
}
