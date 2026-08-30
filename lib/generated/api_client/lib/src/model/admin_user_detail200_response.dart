//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:lythaus_api_client/src/model/admin_user.dart';
import 'package:built_collection/built_collection.dart';
import 'package:built_value/json_object.dart';
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'admin_user_detail200_response.g.dart';

/// AdminUserDetail200Response
///
/// Properties:
/// * [user]
/// * [activity]
@BuiltValue()
abstract class AdminUserDetail200Response implements Built<AdminUserDetail200Response, AdminUserDetail200ResponseBuilder> {
  @BuiltValueField(wireName: r'user')
  AdminUser? get user;

  @BuiltValueField(wireName: r'activity')
  BuiltList<JsonObject>? get activity;

  AdminUserDetail200Response._();

  factory AdminUserDetail200Response([void updates(AdminUserDetail200ResponseBuilder b)]) = _$AdminUserDetail200Response;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(AdminUserDetail200ResponseBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<AdminUserDetail200Response> get serializer => _$AdminUserDetail200ResponseSerializer();
}

class _$AdminUserDetail200ResponseSerializer implements PrimitiveSerializer<AdminUserDetail200Response> {
  @override
  final Iterable<Type> types = const [AdminUserDetail200Response, _$AdminUserDetail200Response];

  @override
  final String wireName = r'AdminUserDetail200Response';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    AdminUserDetail200Response object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    if (object.user != null) {
      yield r'user';
      yield serializers.serialize(
        object.user,
        specifiedType: const FullType(AdminUser),
      );
    }
    if (object.activity != null) {
      yield r'activity';
      yield serializers.serialize(
        object.activity,
        specifiedType: const FullType(BuiltList, [FullType(JsonObject)]),
      );
    }
  }

  @override
  Object serialize(
    Serializers serializers,
    AdminUserDetail200Response object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required AdminUserDetail200ResponseBuilder result,
    required List<Object?> unhandled,
  }) {
    for (var i = 0; i < serializedList.length; i += 2) {
      final key = serializedList[i] as String;
      final value = serializedList[i + 1];
      switch (key) {
        case r'user':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(AdminUser),
          ) as AdminUser;
          result.user.replace(valueDes);
          break;
        case r'activity':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(BuiltList, [FullType(JsonObject)]),
          ) as BuiltList<JsonObject>;
          result.activity.replace(valueDes);
          break;
        default:
          unhandled.add(key);
          unhandled.add(value);
          break;
      }
    }
  }

  @override
  AdminUserDetail200Response deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = AdminUserDetail200ResponseBuilder();
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
