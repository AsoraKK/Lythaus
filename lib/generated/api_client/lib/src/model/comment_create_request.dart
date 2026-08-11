//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:lythaus_api_client/src/model/declared_creation_mode.dart';
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'comment_create_request.g.dart';

/// The declaration is a deterministic public authorship disclosure. AI-generated content is rejected. For ai_assisted, the normalized body must contain fewer than 250 user-perceived Unicode characters (grapheme clusters).
///
/// Properties:
/// * [body]
/// * [parentId]
/// * [declaredCreationMode]
@BuiltValue()
abstract class CommentCreateRequest implements Built<CommentCreateRequest, CommentCreateRequestBuilder> {
  @BuiltValueField(wireName: r'body')
  String get body;

  @BuiltValueField(wireName: r'parentId')
  String? get parentId;

  @BuiltValueField(wireName: r'declaredCreationMode')
  DeclaredCreationMode get declaredCreationMode;
  // enum declaredCreationModeEnum {  human,  ai_assisted,  };

  CommentCreateRequest._();

  factory CommentCreateRequest([void updates(CommentCreateRequestBuilder b)]) = _$CommentCreateRequest;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(CommentCreateRequestBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<CommentCreateRequest> get serializer => _$CommentCreateRequestSerializer();
}

class _$CommentCreateRequestSerializer implements PrimitiveSerializer<CommentCreateRequest> {
  @override
  final Iterable<Type> types = const [CommentCreateRequest, _$CommentCreateRequest];

  @override
  final String wireName = r'CommentCreateRequest';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    CommentCreateRequest object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    yield r'body';
    yield serializers.serialize(
      object.body,
      specifiedType: const FullType(String),
    );
    if (object.parentId != null) {
      yield r'parentId';
      yield serializers.serialize(
        object.parentId,
        specifiedType: const FullType(String),
      );
    }
    yield r'declaredCreationMode';
    yield serializers.serialize(
      object.declaredCreationMode,
      specifiedType: const FullType(DeclaredCreationMode),
    );
  }

  @override
  Object serialize(
    Serializers serializers,
    CommentCreateRequest object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required CommentCreateRequestBuilder result,
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
        case r'parentId':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.parentId = valueDes;
          break;
        case r'declaredCreationMode':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(DeclaredCreationMode),
          ) as DeclaredCreationMode;
          result.declaredCreationMode = valueDes;
          break;
        default:
          unhandled.add(key);
          unhandled.add(value);
          break;
      }
    }
  }

  @override
  CommentCreateRequest deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = CommentCreateRequestBuilder();
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
