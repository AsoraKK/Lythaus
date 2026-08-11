//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'target_user_request.g.dart';

/// TargetUserRequest
///
/// Properties:
/// * [userId]
@BuiltValue()
abstract class TargetUserRequest implements Built<TargetUserRequest, TargetUserRequestBuilder> {
  @BuiltValueField(wireName: r'userId')
  String get userId;

  TargetUserRequest._();

  factory TargetUserRequest([void updates(TargetUserRequestBuilder b)]) = _$TargetUserRequest;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(TargetUserRequestBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<TargetUserRequest> get serializer => _$TargetUserRequestSerializer();
}

class _$TargetUserRequestSerializer implements PrimitiveSerializer<TargetUserRequest> {
  @override
  final Iterable<Type> types = const [TargetUserRequest, _$TargetUserRequest];

  @override
  final String wireName = r'TargetUserRequest';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    TargetUserRequest object, {
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
    TargetUserRequest object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required TargetUserRequestBuilder result,
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
  TargetUserRequest deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = TargetUserRequestBuilder();
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
