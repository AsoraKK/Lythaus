//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:built_collection/built_collection.dart';
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'create_post_request.g.dart';

/// CreatePostRequest
///
/// Properties:
/// * [body]
/// * [declaredCreationMode] - Required user authorship disclosure. Public responses use categorical labels only.
/// * [geoScope]
/// * [placeId]
@BuiltValue()
abstract class CreatePostRequest implements Built<CreatePostRequest, CreatePostRequestBuilder> {
  @BuiltValueField(wireName: r'body')
  String get body;

  /// Required user authorship disclosure. Public responses use categorical labels only.
  @BuiltValueField(wireName: r'declaredCreationMode')
  CreatePostRequestDeclaredCreationModeEnum get declaredCreationMode;
  // enum declaredCreationModeEnum {  human,  ai_assisted,  };

  @BuiltValueField(wireName: r'geoScope')
  CreatePostRequestGeoScopeEnum get geoScope;
  // enum geoScopeEnum {  global,  country,  province,  municipality,  community,  none,  };

  @BuiltValueField(wireName: r'placeId')
  String? get placeId;

  CreatePostRequest._();

  factory CreatePostRequest([void updates(CreatePostRequestBuilder b)]) = _$CreatePostRequest;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(CreatePostRequestBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<CreatePostRequest> get serializer => _$CreatePostRequestSerializer();
}

class _$CreatePostRequestSerializer implements PrimitiveSerializer<CreatePostRequest> {
  @override
  final Iterable<Type> types = const [CreatePostRequest, _$CreatePostRequest];

  @override
  final String wireName = r'CreatePostRequest';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    CreatePostRequest object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    yield r'body';
    yield serializers.serialize(
      object.body,
      specifiedType: const FullType(String),
    );
    yield r'declaredCreationMode';
    yield serializers.serialize(
      object.declaredCreationMode,
      specifiedType: const FullType(CreatePostRequestDeclaredCreationModeEnum),
    );
    yield r'geoScope';
    yield serializers.serialize(
      object.geoScope,
      specifiedType: const FullType(CreatePostRequestGeoScopeEnum),
    );
    if (object.placeId != null) {
      yield r'placeId';
      yield serializers.serialize(
        object.placeId,
        specifiedType: const FullType(String),
      );
    }
  }

  @override
  Object serialize(
    Serializers serializers,
    CreatePostRequest object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required CreatePostRequestBuilder result,
    required List<Object?> unhandled,
  }) {
    for (var i = 0; i < serializedList.length; i += 2) {
      final key = serializedList[i] as String;
      final value = serializedList[i + 1];
      switch (key) {
        case r'body':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.body = valueDes;
          break;
        case r'declaredCreationMode':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(CreatePostRequestDeclaredCreationModeEnum),
          ) as CreatePostRequestDeclaredCreationModeEnum;
          result.declaredCreationMode = valueDes;
          break;
        case r'geoScope':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(CreatePostRequestGeoScopeEnum),
          ) as CreatePostRequestGeoScopeEnum;
          result.geoScope = valueDes;
          break;
        case r'placeId':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.placeId = valueDes;
          break;
        default:
          unhandled.add(key);
          unhandled.add(value);
          break;
      }
    }
  }

  @override
  CreatePostRequest deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = CreatePostRequestBuilder();
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

class CreatePostRequestDeclaredCreationModeEnum extends EnumClass {

  /// Required user authorship disclosure. Public responses use categorical labels only.
  @BuiltValueEnumConst(wireName: r'human')
  static const CreatePostRequestDeclaredCreationModeEnum human = _$createPostRequestDeclaredCreationModeEnum_human;
  /// Required user authorship disclosure. Public responses use categorical labels only.
  @BuiltValueEnumConst(wireName: r'ai_assisted')
  static const CreatePostRequestDeclaredCreationModeEnum aiAssisted = _$createPostRequestDeclaredCreationModeEnum_aiAssisted;

  static Serializer<CreatePostRequestDeclaredCreationModeEnum> get serializer => _$createPostRequestDeclaredCreationModeEnumSerializer;

  const CreatePostRequestDeclaredCreationModeEnum._(String name): super(name);

  static BuiltSet<CreatePostRequestDeclaredCreationModeEnum> get values => _$createPostRequestDeclaredCreationModeEnumValues;
  static CreatePostRequestDeclaredCreationModeEnum valueOf(String name) => _$createPostRequestDeclaredCreationModeEnumValueOf(name);
}

class CreatePostRequestGeoScopeEnum extends EnumClass {

  @BuiltValueEnumConst(wireName: r'global')
  static const CreatePostRequestGeoScopeEnum global = _$createPostRequestGeoScopeEnum_global;
  @BuiltValueEnumConst(wireName: r'country')
  static const CreatePostRequestGeoScopeEnum country = _$createPostRequestGeoScopeEnum_country;
  @BuiltValueEnumConst(wireName: r'province')
  static const CreatePostRequestGeoScopeEnum province = _$createPostRequestGeoScopeEnum_province;
  @BuiltValueEnumConst(wireName: r'municipality')
  static const CreatePostRequestGeoScopeEnum municipality = _$createPostRequestGeoScopeEnum_municipality;
  @BuiltValueEnumConst(wireName: r'community')
  static const CreatePostRequestGeoScopeEnum community = _$createPostRequestGeoScopeEnum_community;
  @BuiltValueEnumConst(wireName: r'none')
  static const CreatePostRequestGeoScopeEnum none = _$createPostRequestGeoScopeEnum_none;

  static Serializer<CreatePostRequestGeoScopeEnum> get serializer => _$createPostRequestGeoScopeEnumSerializer;

  const CreatePostRequestGeoScopeEnum._(String name): super(name);

  static BuiltSet<CreatePostRequestGeoScopeEnum> get values => _$createPostRequestGeoScopeEnumValues;
  static CreatePostRequestGeoScopeEnum valueOf(String name) => _$createPostRequestGeoScopeEnumValueOf(name);
}
