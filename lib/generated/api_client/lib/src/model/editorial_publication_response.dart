//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'editorial_publication_response.g.dart';

/// EditorialPublicationResponse
///
/// Properties:
/// * [id]
/// * [published]
@BuiltValue()
abstract class EditorialPublicationResponse implements Built<EditorialPublicationResponse, EditorialPublicationResponseBuilder> {
  @BuiltValueField(wireName: r'id')
  String get id;

  @BuiltValueField(wireName: r'published')
  bool get published;

  EditorialPublicationResponse._();

  factory EditorialPublicationResponse([void updates(EditorialPublicationResponseBuilder b)]) = _$EditorialPublicationResponse;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(EditorialPublicationResponseBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<EditorialPublicationResponse> get serializer => _$EditorialPublicationResponseSerializer();
}

class _$EditorialPublicationResponseSerializer implements PrimitiveSerializer<EditorialPublicationResponse> {
  @override
  final Iterable<Type> types = const [EditorialPublicationResponse, _$EditorialPublicationResponse];

  @override
  final String wireName = r'EditorialPublicationResponse';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    EditorialPublicationResponse object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    yield r'id';
    yield serializers.serialize(
      object.id,
      specifiedType: const FullType(String),
    );
    yield r'published';
    yield serializers.serialize(
      object.published,
      specifiedType: const FullType(bool),
    );
  }

  @override
  Object serialize(
    Serializers serializers,
    EditorialPublicationResponse object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required EditorialPublicationResponseBuilder result,
    required List<Object?> unhandled,
  }) {
    for (var i = 0; i < serializedList.length; i += 2) {
      final key = serializedList[i] as String;
      final value = serializedList[i + 1];
      switch (key) {
        case r'id':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.id = valueDes;
          break;
        case r'published':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(bool),
          ) as bool;
          result.published = valueDes;
          break;
        default:
          unhandled.add(key);
          unhandled.add(value);
          break;
      }
    }
  }

  @override
  EditorialPublicationResponse deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = EditorialPublicationResponseBuilder();
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
