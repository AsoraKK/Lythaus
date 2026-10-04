//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:lythaus_api_client/src/model/owner_private_records.dart';
import 'package:lythaus_api_client/src/model/owner_support_request.dart';
import 'package:built_collection/built_collection.dart';
import 'package:lythaus_api_client/src/model/public_message.dart';
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'owner_detail.g.dart';

/// OwnerDetail
///
/// Properties:
/// * [request]
/// * [messages]
/// * [nextMessageCursor]
/// * [private]
@BuiltValue()
abstract class OwnerDetail implements Built<OwnerDetail, OwnerDetailBuilder> {
  @BuiltValueField(wireName: r'request')
  OwnerSupportRequest get request;

  @BuiltValueField(wireName: r'messages')
  BuiltList<PublicMessage> get messages;

  @BuiltValueField(wireName: r'nextMessageCursor')
  int? get nextMessageCursor;

  @BuiltValueField(wireName: r'private')
  OwnerPrivateRecords get private;

  OwnerDetail._();

  factory OwnerDetail([void updates(OwnerDetailBuilder b)]) = _$OwnerDetail;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(OwnerDetailBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<OwnerDetail> get serializer => _$OwnerDetailSerializer();
}

class _$OwnerDetailSerializer implements PrimitiveSerializer<OwnerDetail> {
  @override
  final Iterable<Type> types = const [OwnerDetail, _$OwnerDetail];

  @override
  final String wireName = r'OwnerDetail';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    OwnerDetail object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    yield r'request';
    yield serializers.serialize(
      object.request,
      specifiedType: const FullType(OwnerSupportRequest),
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
    yield r'private';
    yield serializers.serialize(
      object.private,
      specifiedType: const FullType(OwnerPrivateRecords),
    );
  }

  @override
  Object serialize(
    Serializers serializers,
    OwnerDetail object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required OwnerDetailBuilder result,
    required List<Object?> unhandled,
  }) {
    for (var i = 0; i < serializedList.length; i += 2) {
      final key = serializedList[i] as String;
      final value = serializedList[i + 1];
      switch (key) {
        case r'request':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(OwnerSupportRequest),
          ) as OwnerSupportRequest;
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
        case r'private':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(OwnerPrivateRecords),
          ) as OwnerPrivateRecords;
          result.private.replace(valueDes);
          break;
        default:
          unhandled.add(key);
          unhandled.add(value);
          break;
      }
    }
  }

  @override
  OwnerDetail deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = OwnerDetailBuilder();
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
