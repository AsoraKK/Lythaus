//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'account_support_access.g.dart';

/// AccountSupportAccess
///
/// Properties:
/// * [available]
@BuiltValue()
abstract class AccountSupportAccess implements Built<AccountSupportAccess, AccountSupportAccessBuilder> {
  @BuiltValueField(wireName: r'available')
  bool get available;

  AccountSupportAccess._();

  factory AccountSupportAccess([void updates(AccountSupportAccessBuilder b)]) = _$AccountSupportAccess;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(AccountSupportAccessBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<AccountSupportAccess> get serializer => _$AccountSupportAccessSerializer();
}

class _$AccountSupportAccessSerializer implements PrimitiveSerializer<AccountSupportAccess> {
  @override
  final Iterable<Type> types = const [AccountSupportAccess, _$AccountSupportAccess];

  @override
  final String wireName = r'AccountSupportAccess';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    AccountSupportAccess object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    yield r'available';
    yield serializers.serialize(
      object.available,
      specifiedType: const FullType(bool),
    );
  }

  @override
  Object serialize(
    Serializers serializers,
    AccountSupportAccess object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required AccountSupportAccessBuilder result,
    required List<Object?> unhandled,
  }) {
    for (var i = 0; i < serializedList.length; i += 2) {
      final key = serializedList[i] as String;
      final value = serializedList[i + 1];
      switch (key) {
        case r'available':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(bool),
          ) as bool;
          result.available = valueDes;
          break;
        default:
          unhandled.add(key);
          unhandled.add(value);
          break;
      }
    }
  }

  @override
  AccountSupportAccess deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = AccountSupportAccessBuilder();
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
