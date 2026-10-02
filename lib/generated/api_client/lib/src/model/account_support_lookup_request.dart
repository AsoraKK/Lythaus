//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'account_support_lookup_request.g.dart';

/// AccountSupportLookupRequest
///
/// Properties:
/// * [email]
/// * [reasonCode] - Use a machine reason code without personal information; it is trimmed and normalized to uppercase.
@BuiltValue()
abstract class AccountSupportLookupRequest implements Built<AccountSupportLookupRequest, AccountSupportLookupRequestBuilder> {
  @BuiltValueField(wireName: r'email')
  String get email;

  /// Use a machine reason code without personal information; it is trimmed and normalized to uppercase.
  @BuiltValueField(wireName: r'reasonCode')
  String get reasonCode;

  AccountSupportLookupRequest._();

  factory AccountSupportLookupRequest([void updates(AccountSupportLookupRequestBuilder b)]) = _$AccountSupportLookupRequest;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(AccountSupportLookupRequestBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<AccountSupportLookupRequest> get serializer => _$AccountSupportLookupRequestSerializer();
}

class _$AccountSupportLookupRequestSerializer implements PrimitiveSerializer<AccountSupportLookupRequest> {
  @override
  final Iterable<Type> types = const [AccountSupportLookupRequest, _$AccountSupportLookupRequest];

  @override
  final String wireName = r'AccountSupportLookupRequest';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    AccountSupportLookupRequest object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    yield r'email';
    yield serializers.serialize(
      object.email,
      specifiedType: const FullType(String),
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
    AccountSupportLookupRequest object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required AccountSupportLookupRequestBuilder result,
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
  AccountSupportLookupRequest deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = AccountSupportLookupRequestBuilder();
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
