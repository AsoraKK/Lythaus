//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:lythaus_api_client/src/model/admin_content_state.dart';
import 'package:lythaus_api_client/src/model/admin_content_type.dart';
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'admin_content_action_response.g.dart';

/// AdminContentActionResponse
///
/// Properties:
/// * [contentId]
/// * [contentType]
/// * [status]
@BuiltValue()
abstract class AdminContentActionResponse implements Built<AdminContentActionResponse, AdminContentActionResponseBuilder> {
  @BuiltValueField(wireName: r'contentId')
  String? get contentId;

  @BuiltValueField(wireName: r'contentType')
  AdminContentType? get contentType;
  // enum contentTypeEnum {  post,  comment,  user,  };

  @BuiltValueField(wireName: r'status')
  AdminContentState? get status;
  // enum statusEnum {  PUBLISHED,  BLOCKED,  };

  AdminContentActionResponse._();

  factory AdminContentActionResponse([void updates(AdminContentActionResponseBuilder b)]) = _$AdminContentActionResponse;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(AdminContentActionResponseBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<AdminContentActionResponse> get serializer => _$AdminContentActionResponseSerializer();
}

class _$AdminContentActionResponseSerializer implements PrimitiveSerializer<AdminContentActionResponse> {
  @override
  final Iterable<Type> types = const [AdminContentActionResponse, _$AdminContentActionResponse];

  @override
  final String wireName = r'AdminContentActionResponse';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    AdminContentActionResponse object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    if (object.contentId != null) {
      yield r'contentId';
      yield serializers.serialize(
        object.contentId,
        specifiedType: const FullType(String),
      );
    }
    if (object.contentType != null) {
      yield r'contentType';
      yield serializers.serialize(
        object.contentType,
        specifiedType: const FullType(AdminContentType),
      );
    }
    if (object.status != null) {
      yield r'status';
      yield serializers.serialize(
        object.status,
        specifiedType: const FullType(AdminContentState),
      );
    }
  }

  @override
  Object serialize(
    Serializers serializers,
    AdminContentActionResponse object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required AdminContentActionResponseBuilder result,
    required List<Object?> unhandled,
  }) {
    for (var i = 0; i < serializedList.length; i += 2) {
      final key = serializedList[i] as String;
      final value = serializedList[i + 1];
      switch (key) {
        case r'contentId':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.contentId = valueDes;
          break;
        case r'contentType':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(AdminContentType),
          ) as AdminContentType;
          result.contentType = valueDes;
          break;
        case r'status':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(AdminContentState),
          ) as AdminContentState;
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
  AdminContentActionResponse deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = AdminContentActionResponseBuilder();
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
