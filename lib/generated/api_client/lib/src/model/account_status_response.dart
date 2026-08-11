//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:built_collection/built_collection.dart';
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'account_status_response.g.dart';

/// AccountStatusResponse
///
/// Properties:
/// * [userId]
/// * [status]
@BuiltValue()
abstract class AccountStatusResponse implements Built<AccountStatusResponse, AccountStatusResponseBuilder> {
  @BuiltValueField(wireName: r'userId')
  String get userId;

  @BuiltValueField(wireName: r'status')
  AccountStatusResponseStatusEnum get status;
  // enum statusEnum {  active,  suspended,  locked,  };

  AccountStatusResponse._();

  factory AccountStatusResponse([void updates(AccountStatusResponseBuilder b)]) = _$AccountStatusResponse;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(AccountStatusResponseBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<AccountStatusResponse> get serializer => _$AccountStatusResponseSerializer();
}

class _$AccountStatusResponseSerializer implements PrimitiveSerializer<AccountStatusResponse> {
  @override
  final Iterable<Type> types = const [AccountStatusResponse, _$AccountStatusResponse];

  @override
  final String wireName = r'AccountStatusResponse';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    AccountStatusResponse object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    yield r'userId';
    yield serializers.serialize(
      object.userId,
      specifiedType: const FullType(String),
    );
    yield r'status';
    yield serializers.serialize(
      object.status,
      specifiedType: const FullType(AccountStatusResponseStatusEnum),
    );
  }

  @override
  Object serialize(
    Serializers serializers,
    AccountStatusResponse object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required AccountStatusResponseBuilder result,
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
            specifiedType: const FullType(AccountStatusResponseStatusEnum),
          ) as AccountStatusResponseStatusEnum;
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
  AccountStatusResponse deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = AccountStatusResponseBuilder();
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

class AccountStatusResponseStatusEnum extends EnumClass {

  @BuiltValueEnumConst(wireName: r'active')
  static const AccountStatusResponseStatusEnum active = _$accountStatusResponseStatusEnum_active;
  @BuiltValueEnumConst(wireName: r'suspended')
  static const AccountStatusResponseStatusEnum suspended = _$accountStatusResponseStatusEnum_suspended;
  @BuiltValueEnumConst(wireName: r'locked')
  static const AccountStatusResponseStatusEnum locked = _$accountStatusResponseStatusEnum_locked;

  static Serializer<AccountStatusResponseStatusEnum> get serializer => _$accountStatusResponseStatusEnumSerializer;

  const AccountStatusResponseStatusEnum._(String name): super(name);

  static BuiltSet<AccountStatusResponseStatusEnum> get values => _$accountStatusResponseStatusEnumValues;
  static AccountStatusResponseStatusEnum valueOf(String name) => _$accountStatusResponseStatusEnumValueOf(name);
}
