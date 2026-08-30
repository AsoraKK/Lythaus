//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:built_collection/built_collection.dart';
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'admin_auth_summary.g.dart';

/// AdminAuthSummary
///
/// Properties:
/// * [accounts]
/// * [waitlist]
@BuiltValue()
abstract class AdminAuthSummary implements Built<AdminAuthSummary, AdminAuthSummaryBuilder> {
  @BuiltValueField(wireName: r'accounts')
  BuiltMap<String, int> get accounts;

  @BuiltValueField(wireName: r'waitlist')
  BuiltMap<String, int> get waitlist;

  AdminAuthSummary._();

  factory AdminAuthSummary([void updates(AdminAuthSummaryBuilder b)]) = _$AdminAuthSummary;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(AdminAuthSummaryBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<AdminAuthSummary> get serializer => _$AdminAuthSummarySerializer();
}

class _$AdminAuthSummarySerializer implements PrimitiveSerializer<AdminAuthSummary> {
  @override
  final Iterable<Type> types = const [AdminAuthSummary, _$AdminAuthSummary];

  @override
  final String wireName = r'AdminAuthSummary';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    AdminAuthSummary object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    yield r'accounts';
    yield serializers.serialize(
      object.accounts,
      specifiedType: const FullType(BuiltMap, [FullType(String), FullType(int)]),
    );
    yield r'waitlist';
    yield serializers.serialize(
      object.waitlist,
      specifiedType: const FullType(BuiltMap, [FullType(String), FullType(int)]),
    );
  }

  @override
  Object serialize(
    Serializers serializers,
    AdminAuthSummary object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required AdminAuthSummaryBuilder result,
    required List<Object?> unhandled,
  }) {
    for (var i = 0; i < serializedList.length; i += 2) {
      final key = serializedList[i] as String;
      final value = serializedList[i + 1];
      switch (key) {
        case r'accounts':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(BuiltMap, [FullType(String), FullType(int)]),
          ) as BuiltMap<String, int>;
          result.accounts.replace(valueDes);
          break;
        case r'waitlist':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(BuiltMap, [FullType(String), FullType(int)]),
          ) as BuiltMap<String, int>;
          result.waitlist.replace(valueDes);
          break;
        default:
          unhandled.add(key);
          unhandled.add(value);
          break;
      }
    }
  }

  @override
  AdminAuthSummary deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = AdminAuthSummaryBuilder();
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
