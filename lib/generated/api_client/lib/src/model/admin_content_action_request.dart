//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:lythaus_api_client/src/model/admin_content_type.dart';
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'admin_content_action_request.g.dart';

/// AdminContentActionRequest
///
/// Properties:
/// * [contentType]
/// * [reasonCode]
/// * [note]
@BuiltValue()
abstract class AdminContentActionRequest implements Built<AdminContentActionRequest, AdminContentActionRequestBuilder> {
  @BuiltValueField(wireName: r'contentType')
  AdminContentType get contentType;
  // enum contentTypeEnum {  post,  comment,  user,  };

  @BuiltValueField(wireName: r'reasonCode')
  String get reasonCode;

  @BuiltValueField(wireName: r'note')
  String? get note;

  AdminContentActionRequest._();

  factory AdminContentActionRequest([void updates(AdminContentActionRequestBuilder b)]) = _$AdminContentActionRequest;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(AdminContentActionRequestBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<AdminContentActionRequest> get serializer => _$AdminContentActionRequestSerializer();
}

class _$AdminContentActionRequestSerializer implements PrimitiveSerializer<AdminContentActionRequest> {
  @override
  final Iterable<Type> types = const [AdminContentActionRequest, _$AdminContentActionRequest];

  @override
  final String wireName = r'AdminContentActionRequest';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    AdminContentActionRequest object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    yield r'contentType';
    yield serializers.serialize(
      object.contentType,
      specifiedType: const FullType(AdminContentType),
    );
    yield r'reasonCode';
    yield serializers.serialize(
      object.reasonCode,
      specifiedType: const FullType(String),
    );
    if (object.note != null) {
      yield r'note';
      yield serializers.serialize(
        object.note,
        specifiedType: const FullType(String),
      );
    }
  }

  @override
  Object serialize(
    Serializers serializers,
    AdminContentActionRequest object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required AdminContentActionRequestBuilder result,
    required List<Object?> unhandled,
  }) {
    for (var i = 0; i < serializedList.length; i += 2) {
      final key = serializedList[i] as String;
      final value = serializedList[i + 1];
      switch (key) {
        case r'contentType':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(AdminContentType),
          ) as AdminContentType;
          result.contentType = valueDes;
          break;
        case r'reasonCode':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.reasonCode = valueDes;
          break;
        case r'note':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.note = valueDes;
          break;
        default:
          unhandled.add(key);
          unhandled.add(value);
          break;
      }
    }
  }

  @override
  AdminContentActionRequest deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = AdminContentActionRequestBuilder();
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
