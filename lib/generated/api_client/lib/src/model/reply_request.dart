//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'reply_request.g.dart';

/// ReplyRequest
///
/// Properties:
/// * [expectedRevision]
/// * [message]
@BuiltValue()
abstract class ReplyRequest implements Built<ReplyRequest, ReplyRequestBuilder> {
  @BuiltValueField(wireName: r'expectedRevision')
  int get expectedRevision;

  @BuiltValueField(wireName: r'message')
  String get message;

  ReplyRequest._();

  factory ReplyRequest([void updates(ReplyRequestBuilder b)]) = _$ReplyRequest;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(ReplyRequestBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<ReplyRequest> get serializer => _$ReplyRequestSerializer();
}

class _$ReplyRequestSerializer implements PrimitiveSerializer<ReplyRequest> {
  @override
  final Iterable<Type> types = const [ReplyRequest, _$ReplyRequest];

  @override
  final String wireName = r'ReplyRequest';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    ReplyRequest object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    yield r'expectedRevision';
    yield serializers.serialize(
      object.expectedRevision,
      specifiedType: const FullType(int),
    );
    yield r'message';
    yield serializers.serialize(
      object.message,
      specifiedType: const FullType(String),
    );
  }

  @override
  Object serialize(
    Serializers serializers,
    ReplyRequest object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required ReplyRequestBuilder result,
    required List<Object?> unhandled,
  }) {
    for (var i = 0; i < serializedList.length; i += 2) {
      final key = serializedList[i] as String;
      final value = serializedList[i + 1];
      switch (key) {
        case r'expectedRevision':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(int),
          ) as int;
          result.expectedRevision = valueDes;
          break;
        case r'message':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.message = valueDes;
          break;
        default:
          unhandled.add(key);
          unhandled.add(value);
          break;
      }
    }
  }

  @override
  ReplyRequest deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = ReplyRequestBuilder();
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
