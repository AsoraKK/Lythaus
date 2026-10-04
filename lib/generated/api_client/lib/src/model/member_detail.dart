//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:built_collection/built_collection.dart';
import 'package:lythaus_api_client/src/model/member_support_request.dart';
import 'package:lythaus_api_client/src/model/public_message.dart';
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'member_detail.g.dart';

/// MemberDetail
///
/// Properties:
/// * [request]
/// * [messages]
/// * [nextMessageCursor]
@BuiltValue()
abstract class MemberDetail implements Built<MemberDetail, MemberDetailBuilder> {
  @BuiltValueField(wireName: r'request')
  MemberSupportRequest get request;

  @BuiltValueField(wireName: r'messages')
  BuiltList<PublicMessage> get messages;

  @BuiltValueField(wireName: r'nextMessageCursor')
  int? get nextMessageCursor;

  MemberDetail._();

  factory MemberDetail([void updates(MemberDetailBuilder b)]) = _$MemberDetail;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(MemberDetailBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<MemberDetail> get serializer => _$MemberDetailSerializer();
}

class _$MemberDetailSerializer implements PrimitiveSerializer<MemberDetail> {
  @override
  final Iterable<Type> types = const [MemberDetail, _$MemberDetail];

  @override
  final String wireName = r'MemberDetail';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    MemberDetail object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    yield r'request';
    yield serializers.serialize(
      object.request,
      specifiedType: const FullType(MemberSupportRequest),
    );
    yield r'messages';
    yield serializers.serialize(
      object.messages,
      specifiedType: const FullType(BuiltList, [FullType(PublicMessage)]),
    );
    yield r'nextMessageCursor';
    yield object.nextMessageCursor == null ? null : serializers.serialize(
      object.nextMessageCursor,
      specifiedType: const FullType.nullable(int),
    );
  }

  @override
  Object serialize(
    Serializers serializers,
    MemberDetail object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required MemberDetailBuilder result,
    required List<Object?> unhandled,
  }) {
    for (var i = 0; i < serializedList.length; i += 2) {
      final key = serializedList[i] as String;
      final value = serializedList[i + 1];
      switch (key) {
        case r'request':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(MemberSupportRequest),
          ) as MemberSupportRequest;
          result.request.replace(valueDes);
          break;
        case r'messages':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(BuiltList, [FullType(PublicMessage)]),
          ) as BuiltList<PublicMessage>;
          result.messages.replace(valueDes);
          break;
        case r'nextMessageCursor':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType.nullable(int),
          ) as int?;
          if (valueDes == null) continue;
          result.nextMessageCursor = valueDes;
          break;
        default:
          unhandled.add(key);
          unhandled.add(value);
          break;
      }
    }
  }

  @override
  MemberDetail deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = MemberDetailBuilder();
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
