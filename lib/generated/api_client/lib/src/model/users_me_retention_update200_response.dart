//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:built_collection/built_collection.dart';
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'users_me_retention_update200_response.g.dart';

/// UsersMeRetentionUpdate200Response
///
/// Properties:
/// * [contentType]
/// * [retentionDays]
@BuiltValue()
abstract class UsersMeRetentionUpdate200Response implements Built<UsersMeRetentionUpdate200Response, UsersMeRetentionUpdate200ResponseBuilder> {
  @BuiltValueField(wireName: r'contentType')
  UsersMeRetentionUpdate200ResponseContentTypeEnum get contentType;
  // enum contentTypeEnum {  post,  media,  };

  @BuiltValueField(wireName: r'retentionDays')
  int get retentionDays;

  UsersMeRetentionUpdate200Response._();

  factory UsersMeRetentionUpdate200Response([void updates(UsersMeRetentionUpdate200ResponseBuilder b)]) = _$UsersMeRetentionUpdate200Response;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(UsersMeRetentionUpdate200ResponseBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<UsersMeRetentionUpdate200Response> get serializer => _$UsersMeRetentionUpdate200ResponseSerializer();
}

class _$UsersMeRetentionUpdate200ResponseSerializer implements PrimitiveSerializer<UsersMeRetentionUpdate200Response> {
  @override
  final Iterable<Type> types = const [UsersMeRetentionUpdate200Response, _$UsersMeRetentionUpdate200Response];

  @override
  final String wireName = r'UsersMeRetentionUpdate200Response';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    UsersMeRetentionUpdate200Response object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    yield r'contentType';
    yield serializers.serialize(
      object.contentType,
      specifiedType: const FullType(UsersMeRetentionUpdate200ResponseContentTypeEnum),
    );
    yield r'retentionDays';
    yield serializers.serialize(
      object.retentionDays,
      specifiedType: const FullType(int),
    );
  }

  @override
  Object serialize(
    Serializers serializers,
    UsersMeRetentionUpdate200Response object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required UsersMeRetentionUpdate200ResponseBuilder result,
    required List<Object?> unhandled,
  }) {
    for (var i = 0; i < serializedList.length; i += 2) {
      final key = serializedList[i] as String;
      final value = serializedList[i + 1];
      switch (key) {
        case r'contentType':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(UsersMeRetentionUpdate200ResponseContentTypeEnum),
          ) as UsersMeRetentionUpdate200ResponseContentTypeEnum;
          result.contentType = valueDes;
          break;
        case r'retentionDays':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(int),
          ) as int;
          result.retentionDays = valueDes;
          break;
        default:
          unhandled.add(key);
          unhandled.add(value);
          break;
      }
    }
  }

  @override
  UsersMeRetentionUpdate200Response deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = UsersMeRetentionUpdate200ResponseBuilder();
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

class UsersMeRetentionUpdate200ResponseContentTypeEnum extends EnumClass {

  @BuiltValueEnumConst(wireName: r'post')
  static const UsersMeRetentionUpdate200ResponseContentTypeEnum post = _$usersMeRetentionUpdate200ResponseContentTypeEnum_post;
  @BuiltValueEnumConst(wireName: r'media')
  static const UsersMeRetentionUpdate200ResponseContentTypeEnum media = _$usersMeRetentionUpdate200ResponseContentTypeEnum_media;

  static Serializer<UsersMeRetentionUpdate200ResponseContentTypeEnum> get serializer => _$usersMeRetentionUpdate200ResponseContentTypeEnumSerializer;

  const UsersMeRetentionUpdate200ResponseContentTypeEnum._(String name): super(name);

  static BuiltSet<UsersMeRetentionUpdate200ResponseContentTypeEnum> get values => _$usersMeRetentionUpdate200ResponseContentTypeEnumValues;
  static UsersMeRetentionUpdate200ResponseContentTypeEnum valueOf(String name) => _$usersMeRetentionUpdate200ResponseContentTypeEnumValueOf(name);
}
