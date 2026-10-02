//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'account_support_error.g.dart';

/// AccountSupportError
///
/// Properties:
/// * [error]
/// * [correlationId]
@BuiltValue()
abstract class AccountSupportError implements Built<AccountSupportError, AccountSupportErrorBuilder> {
  @BuiltValueField(wireName: r'error')
  String get error;

  @BuiltValueField(wireName: r'correlationId')
  String get correlationId;

  AccountSupportError._();

  factory AccountSupportError([void updates(AccountSupportErrorBuilder b)]) = _$AccountSupportError;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(AccountSupportErrorBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<AccountSupportError> get serializer => _$AccountSupportErrorSerializer();
}

class _$AccountSupportErrorSerializer implements PrimitiveSerializer<AccountSupportError> {
  @override
  final Iterable<Type> types = const [AccountSupportError, _$AccountSupportError];

  @override
  final String wireName = r'AccountSupportError';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    AccountSupportError object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    yield r'error';
    yield serializers.serialize(
      object.error,
      specifiedType: const FullType(String),
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
    AccountSupportError object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required AccountSupportErrorBuilder result,
    required List<Object?> unhandled,
  }) {
    for (var i = 0; i < serializedList.length; i += 2) {
      final key = serializedList[i] as String;
      final value = serializedList[i + 1];
      switch (key) {
        case r'error':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.error = valueDes;
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
  AccountSupportError deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = AccountSupportErrorBuilder();
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
