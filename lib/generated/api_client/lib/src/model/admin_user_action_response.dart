//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:lythaus_api_client/src/model/admin_user_status.dart';
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'admin_user_action_response.g.dart';

/// AdminUserActionResponse
///
/// Properties:
/// * [userId]
/// * [status]
@BuiltValue()
abstract class AdminUserActionResponse implements Built<AdminUserActionResponse, AdminUserActionResponseBuilder> {
  @BuiltValueField(wireName: r'userId')
  String? get userId;

  @BuiltValueField(wireName: r'status')
  AdminUserStatus? get status;
  // enum statusEnum {  ACTIVE,  DISABLED,  };

  AdminUserActionResponse._();

  factory AdminUserActionResponse([void updates(AdminUserActionResponseBuilder b)]) = _$AdminUserActionResponse;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(AdminUserActionResponseBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<AdminUserActionResponse> get serializer => _$AdminUserActionResponseSerializer();
}

class _$AdminUserActionResponseSerializer implements PrimitiveSerializer<AdminUserActionResponse> {
  @override
  final Iterable<Type> types = const [AdminUserActionResponse, _$AdminUserActionResponse];

  @override
  final String wireName = r'AdminUserActionResponse';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    AdminUserActionResponse object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    if (object.userId != null) {
      yield r'userId';
      yield serializers.serialize(
        object.userId,
        specifiedType: const FullType(String),
      );
    }
    if (object.status != null) {
      yield r'status';
      yield serializers.serialize(
        object.status,
        specifiedType: const FullType(AdminUserStatus),
      );
    }
  }

  @override
  Object serialize(
    Serializers serializers,
    AdminUserActionResponse object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required AdminUserActionResponseBuilder result,
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
            specifiedType: const FullType(AdminUserStatus),
          ) as AdminUserStatus;
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
  AdminUserActionResponse deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = AdminUserActionResponseBuilder();
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
