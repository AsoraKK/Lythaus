//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'editorial_publication_create.g.dart';

/// EditorialPublicationCreate
///
/// Properties:
/// * [title]
/// * [postId]
@BuiltValue()
abstract class EditorialPublicationCreate implements Built<EditorialPublicationCreate, EditorialPublicationCreateBuilder> {
  @BuiltValueField(wireName: r'title')
  String get title;

  @BuiltValueField(wireName: r'postId')
  String? get postId;

  EditorialPublicationCreate._();

  factory EditorialPublicationCreate([void updates(EditorialPublicationCreateBuilder b)]) = _$EditorialPublicationCreate;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(EditorialPublicationCreateBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<EditorialPublicationCreate> get serializer => _$EditorialPublicationCreateSerializer();
}

class _$EditorialPublicationCreateSerializer implements PrimitiveSerializer<EditorialPublicationCreate> {
  @override
  final Iterable<Type> types = const [EditorialPublicationCreate, _$EditorialPublicationCreate];

  @override
  final String wireName = r'EditorialPublicationCreate';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    EditorialPublicationCreate object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    yield r'title';
    yield serializers.serialize(
      object.title,
      specifiedType: const FullType(String),
    );
    if (object.postId != null) {
      yield r'postId';
      yield serializers.serialize(
        object.postId,
        specifiedType: const FullType(String),
      );
    }
  }

  @override
  Object serialize(
    Serializers serializers,
    EditorialPublicationCreate object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required EditorialPublicationCreateBuilder result,
    required List<Object?> unhandled,
  }) {
    for (var i = 0; i < serializedList.length; i += 2) {
      final key = serializedList[i] as String;
      final value = serializedList[i + 1];
      switch (key) {
        case r'title':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.title = valueDes;
          break;
        case r'postId':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.postId = valueDes;
          break;
        default:
          unhandled.add(key);
          unhandled.add(value);
          break;
      }
    }
  }

  @override
  EditorialPublicationCreate deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = EditorialPublicationCreateBuilder();
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
