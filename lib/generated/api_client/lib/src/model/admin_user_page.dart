//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:lythaus_api_client/src/model/admin_user.dart';
import 'package:built_collection/built_collection.dart';
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'admin_user_page.g.dart';

/// AdminUserPage
///
/// Properties:
/// * [items]
/// * [nextCursor]
@BuiltValue()
abstract class AdminUserPage implements Built<AdminUserPage, AdminUserPageBuilder> {
  @BuiltValueField(wireName: r'items')
  BuiltList<AdminUser> get items;

  @BuiltValueField(wireName: r'nextCursor')
  String? get nextCursor;

  AdminUserPage._();

  factory AdminUserPage([void updates(AdminUserPageBuilder b)]) = _$AdminUserPage;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(AdminUserPageBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<AdminUserPage> get serializer => _$AdminUserPageSerializer();
}

class _$AdminUserPageSerializer implements PrimitiveSerializer<AdminUserPage> {
  @override
  final Iterable<Type> types = const [AdminUserPage, _$AdminUserPage];

  @override
  final String wireName = r'AdminUserPage';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    AdminUserPage object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    yield r'items';
    yield serializers.serialize(
      object.items,
      specifiedType: const FullType(BuiltList, [FullType(AdminUser)]),
    );
    yield r'nextCursor';
    yield object.nextCursor == null ? null : serializers.serialize(
      object.nextCursor,
      specifiedType: const FullType.nullable(String),
    );
  }

  @override
  Object serialize(
    Serializers serializers,
    AdminUserPage object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required AdminUserPageBuilder result,
    required List<Object?> unhandled,
  }) {
    for (var i = 0; i < serializedList.length; i += 2) {
      final key = serializedList[i] as String;
      final value = serializedList[i + 1];
      switch (key) {
        case r'items':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(BuiltList, [FullType(AdminUser)]),
          ) as BuiltList<AdminUser>;
          result.items.replace(valueDes);
          break;
        case r'nextCursor':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType.nullable(String),
          ) as String?;
          if (valueDes == null) continue;
          result.nextCursor = valueDes;
          break;
        default:
          unhandled.add(key);
          unhandled.add(value);
          break;
      }
    }
  }

  @override
  AdminUserPage deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = AdminUserPageBuilder();
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
