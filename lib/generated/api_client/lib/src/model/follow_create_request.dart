//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'follow_create_request.g.dart';

/// FollowCreateRequest
///
/// Properties:
/// * [userId]
@BuiltValue()
abstract class FollowCreateRequest implements Built<FollowCreateRequest, FollowCreateRequestBuilder> {
  @BuiltValueField(wireName: r'userId')
  String get userId;

  FollowCreateRequest._();

  factory FollowCreateRequest([void updates(FollowCreateRequestBuilder b)]) = _$FollowCreateRequest;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(FollowCreateRequestBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<FollowCreateRequest> get serializer => _$FollowCreateRequestSerializer();
}

class _$FollowCreateRequestSerializer implements PrimitiveSerializer<FollowCreateRequest> {
  @override
  final Iterable<Type> types = const [FollowCreateRequest, _$FollowCreateRequest];

  @override
  final String wireName = r'FollowCreateRequest';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    FollowCreateRequest object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    yield r'userId';
    yield serializers.serialize(
      object.userId,
      specifiedType: const FullType(String),
    );
  }

  @override
  Object serialize(
    Serializers serializers,
    FollowCreateRequest object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required FollowCreateRequestBuilder result,
    required List<Object?> unhandled,
  }) {
    for (var i = 0; i < serializedList.length; i += 2) {
      final key = serializedList[i] as String;
      final value = serializedList[i + 1];
      switch (key) {
        case r'userId':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.userId = valueDes;
          break;
        default:
          unhandled.add(key);
          unhandled.add(value);
          break;
      }
    }
  }

  @override
  FollowCreateRequest deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = FollowCreateRequestBuilder();
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
