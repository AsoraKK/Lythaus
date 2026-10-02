//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:lythaus_api_client/src/model/owner_comment.dart';
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'comments_owner_view200_response.g.dart';

/// CommentsOwnerView200Response
///
/// Properties:
/// * [comment]
/// * [correlationId]
@BuiltValue()
abstract class CommentsOwnerView200Response implements Built<CommentsOwnerView200Response, CommentsOwnerView200ResponseBuilder> {
  @BuiltValueField(wireName: r'comment')
  OwnerComment get comment;

  @BuiltValueField(wireName: r'correlationId')
  String? get correlationId;

  CommentsOwnerView200Response._();

  factory CommentsOwnerView200Response([void updates(CommentsOwnerView200ResponseBuilder b)]) = _$CommentsOwnerView200Response;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(CommentsOwnerView200ResponseBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<CommentsOwnerView200Response> get serializer => _$CommentsOwnerView200ResponseSerializer();
}

class _$CommentsOwnerView200ResponseSerializer implements PrimitiveSerializer<CommentsOwnerView200Response> {
  @override
  final Iterable<Type> types = const [CommentsOwnerView200Response, _$CommentsOwnerView200Response];

  @override
  final String wireName = r'CommentsOwnerView200Response';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    CommentsOwnerView200Response object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    yield r'comment';
    yield serializers.serialize(
      object.comment,
      specifiedType: const FullType(OwnerComment),
    );
    if (object.correlationId != null) {
      yield r'correlationId';
      yield serializers.serialize(
        object.correlationId,
        specifiedType: const FullType(String),
      );
    }
  }

  @override
  Object serialize(
    Serializers serializers,
    CommentsOwnerView200Response object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required CommentsOwnerView200ResponseBuilder result,
    required List<Object?> unhandled,
  }) {
    for (var i = 0; i < serializedList.length; i += 2) {
      final key = serializedList[i] as String;
      final value = serializedList[i + 1];
      switch (key) {
        case r'comment':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(OwnerComment),
          ) as OwnerComment;
          result.comment.replace(valueDes);
          break;
        case r'correlationId':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.correlationId = valueDes;
          break;
        default:
          unhandled.add(key);
          unhandled.add(value);
          break;
      }
    }
  }

  @override
  CommentsOwnerView200Response deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = CommentsOwnerView200ResponseBuilder();
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
