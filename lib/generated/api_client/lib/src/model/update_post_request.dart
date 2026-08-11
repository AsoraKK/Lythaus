//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:built_collection/built_collection.dart';
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'update_post_request.g.dart';

/// UpdatePostRequest
///
/// Properties:
/// * [body]
/// * [declaredCreationMode] - Required with body changes. AI-generated public content is rejected.
/// * [visibility]
@BuiltValue()
abstract class UpdatePostRequest implements Built<UpdatePostRequest, UpdatePostRequestBuilder> {
  @BuiltValueField(wireName: r'body')
  String? get body;

  /// Required with body changes. AI-generated public content is rejected.
  @BuiltValueField(wireName: r'declaredCreationMode')
  UpdatePostRequestDeclaredCreationModeEnum? get declaredCreationMode;
  // enum declaredCreationModeEnum {  human,  ai_assisted,  };

  @BuiltValueField(wireName: r'visibility')
  UpdatePostRequestVisibilityEnum? get visibility;
  // enum visibilityEnum {  public,  followers,  private,  };

  UpdatePostRequest._();

  factory UpdatePostRequest([void updates(UpdatePostRequestBuilder b)]) = _$UpdatePostRequest;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(UpdatePostRequestBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<UpdatePostRequest> get serializer => _$UpdatePostRequestSerializer();
}

class _$UpdatePostRequestSerializer implements PrimitiveSerializer<UpdatePostRequest> {
  @override
  final Iterable<Type> types = const [UpdatePostRequest, _$UpdatePostRequest];

  @override
  final String wireName = r'UpdatePostRequest';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    UpdatePostRequest object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    if (object.body != null) {
      yield r'body';
      yield serializers.serialize(
        object.body,
        specifiedType: const FullType(String),
      );
    }
    if (object.declaredCreationMode != null) {
      yield r'declaredCreationMode';
      yield serializers.serialize(
        object.declaredCreationMode,
        specifiedType: const FullType(UpdatePostRequestDeclaredCreationModeEnum),
      );
    }
    if (object.visibility != null) {
      yield r'visibility';
      yield serializers.serialize(
        object.visibility,
        specifiedType: const FullType(UpdatePostRequestVisibilityEnum),
      );
    }
  }

  @override
  Object serialize(
    Serializers serializers,
    UpdatePostRequest object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required UpdatePostRequestBuilder result,
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
            specifiedType: const FullType(UpdatePostRequestDeclaredCreationModeEnum),
          ) as UpdatePostRequestDeclaredCreationModeEnum;
          result.declaredCreationMode = valueDes;
          break;
        case r'visibility':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(UpdatePostRequestVisibilityEnum),
          ) as UpdatePostRequestVisibilityEnum;
          result.visibility = valueDes;
          break;
        default:
          unhandled.add(key);
          unhandled.add(value);
          break;
      }
    }
  }

  @override
  UpdatePostRequest deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = UpdatePostRequestBuilder();
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

class UpdatePostRequestDeclaredCreationModeEnum extends EnumClass {

  /// Required with body changes. AI-generated public content is rejected.
  @BuiltValueEnumConst(wireName: r'human')
  static const UpdatePostRequestDeclaredCreationModeEnum human = _$updatePostRequestDeclaredCreationModeEnum_human;
  /// Required with body changes. AI-generated public content is rejected.
  @BuiltValueEnumConst(wireName: r'ai_assisted')
  static const UpdatePostRequestDeclaredCreationModeEnum aiAssisted = _$updatePostRequestDeclaredCreationModeEnum_aiAssisted;

  static Serializer<UpdatePostRequestDeclaredCreationModeEnum> get serializer => _$updatePostRequestDeclaredCreationModeEnumSerializer;

  const UpdatePostRequestDeclaredCreationModeEnum._(String name): super(name);

  static BuiltSet<UpdatePostRequestDeclaredCreationModeEnum> get values => _$updatePostRequestDeclaredCreationModeEnumValues;
  static UpdatePostRequestDeclaredCreationModeEnum valueOf(String name) => _$updatePostRequestDeclaredCreationModeEnumValueOf(name);
}

class UpdatePostRequestVisibilityEnum extends EnumClass {

  @BuiltValueEnumConst(wireName: r'public')
  static const UpdatePostRequestVisibilityEnum public = _$updatePostRequestVisibilityEnum_public;
  @BuiltValueEnumConst(wireName: r'followers')
  static const UpdatePostRequestVisibilityEnum followers = _$updatePostRequestVisibilityEnum_followers;
  @BuiltValueEnumConst(wireName: r'private')
  static const UpdatePostRequestVisibilityEnum private = _$updatePostRequestVisibilityEnum_private;

  static Serializer<UpdatePostRequestVisibilityEnum> get serializer => _$updatePostRequestVisibilityEnumSerializer;

  const UpdatePostRequestVisibilityEnum._(String name): super(name);

  static BuiltSet<UpdatePostRequestVisibilityEnum> get values => _$updatePostRequestVisibilityEnumValues;
  static UpdatePostRequestVisibilityEnum valueOf(String name) => _$updatePostRequestVisibilityEnumValueOf(name);
}
