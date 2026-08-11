//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:built_collection/built_collection.dart';
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'users_me_retention_update_request.g.dart';

/// UsersMeRetentionUpdateRequest
///
/// Properties:
/// * [contentType]
/// * [retentionDays]
@BuiltValue()
abstract class UsersMeRetentionUpdateRequest implements Built<UsersMeRetentionUpdateRequest, UsersMeRetentionUpdateRequestBuilder> {
  @BuiltValueField(wireName: r'contentType')
  UsersMeRetentionUpdateRequestContentTypeEnum get contentType;
  // enum contentTypeEnum {  post,  posts,  media,  };

  @BuiltValueField(wireName: r'retentionDays')
  int get retentionDays;

  UsersMeRetentionUpdateRequest._();

  factory UsersMeRetentionUpdateRequest([void updates(UsersMeRetentionUpdateRequestBuilder b)]) = _$UsersMeRetentionUpdateRequest;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(UsersMeRetentionUpdateRequestBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<UsersMeRetentionUpdateRequest> get serializer => _$UsersMeRetentionUpdateRequestSerializer();
}

class _$UsersMeRetentionUpdateRequestSerializer implements PrimitiveSerializer<UsersMeRetentionUpdateRequest> {
  @override
  final Iterable<Type> types = const [UsersMeRetentionUpdateRequest, _$UsersMeRetentionUpdateRequest];

  @override
  final String wireName = r'UsersMeRetentionUpdateRequest';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    UsersMeRetentionUpdateRequest object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    yield r'contentType';
    yield serializers.serialize(
      object.contentType,
      specifiedType: const FullType(UsersMeRetentionUpdateRequestContentTypeEnum),
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
    UsersMeRetentionUpdateRequest object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required UsersMeRetentionUpdateRequestBuilder result,
    required List<Object?> unhandled,
  }) {
    for (var i = 0; i < serializedList.length; i += 2) {
      final key = serializedList[i] as String;
      final value = serializedList[i + 1];
      switch (key) {
        case r'contentType':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(UsersMeRetentionUpdateRequestContentTypeEnum),
          ) as UsersMeRetentionUpdateRequestContentTypeEnum;
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
  UsersMeRetentionUpdateRequest deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = UsersMeRetentionUpdateRequestBuilder();
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

class UsersMeRetentionUpdateRequestContentTypeEnum extends EnumClass {

  @BuiltValueEnumConst(wireName: r'post')
  static const UsersMeRetentionUpdateRequestContentTypeEnum post = _$usersMeRetentionUpdateRequestContentTypeEnum_post;
  @BuiltValueEnumConst(wireName: r'posts')
  static const UsersMeRetentionUpdateRequestContentTypeEnum posts = _$usersMeRetentionUpdateRequestContentTypeEnum_posts;
  @BuiltValueEnumConst(wireName: r'media')
  static const UsersMeRetentionUpdateRequestContentTypeEnum media = _$usersMeRetentionUpdateRequestContentTypeEnum_media;

  static Serializer<UsersMeRetentionUpdateRequestContentTypeEnum> get serializer => _$usersMeRetentionUpdateRequestContentTypeEnumSerializer;

  const UsersMeRetentionUpdateRequestContentTypeEnum._(String name): super(name);

  static BuiltSet<UsersMeRetentionUpdateRequestContentTypeEnum> get values => _$usersMeRetentionUpdateRequestContentTypeEnumValues;
  static UsersMeRetentionUpdateRequestContentTypeEnum valueOf(String name) => _$usersMeRetentionUpdateRequestContentTypeEnumValueOf(name);
}
