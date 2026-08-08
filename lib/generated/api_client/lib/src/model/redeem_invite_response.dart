//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:lythaus_api_client/src/model/redeem_invite_response_data.dart';
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'redeem_invite_response.g.dart';

/// Successful invite redemption – includes fresh token pair.
///
/// Properties:
/// * [success]
/// * [data]
/// * [timestamp]
@BuiltValue()
abstract class RedeemInviteResponse implements Built<RedeemInviteResponse, RedeemInviteResponseBuilder> {
  @BuiltValueField(wireName: r'success')
  bool get success;

  @BuiltValueField(wireName: r'data')
  RedeemInviteResponseData get data;

  @BuiltValueField(wireName: r'timestamp')
  DateTime get timestamp;

  RedeemInviteResponse._();

  factory RedeemInviteResponse([void updates(RedeemInviteResponseBuilder b)]) = _$RedeemInviteResponse;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(RedeemInviteResponseBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<RedeemInviteResponse> get serializer => _$RedeemInviteResponseSerializer();
}

class _$RedeemInviteResponseSerializer implements PrimitiveSerializer<RedeemInviteResponse> {
  @override
  final Iterable<Type> types = const [RedeemInviteResponse, _$RedeemInviteResponse];

  @override
  final String wireName = r'RedeemInviteResponse';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    RedeemInviteResponse object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    yield r'success';
    yield serializers.serialize(
      object.success,
      specifiedType: const FullType(bool),
    );
    yield r'data';
    yield serializers.serialize(
      object.data,
      specifiedType: const FullType(RedeemInviteResponseData),
    );
    yield r'timestamp';
    yield serializers.serialize(
      object.timestamp,
      specifiedType: const FullType(DateTime),
    );
  }

  @override
  Object serialize(
    Serializers serializers,
    RedeemInviteResponse object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required RedeemInviteResponseBuilder result,
    required List<Object?> unhandled,
  }) {
    for (var i = 0; i < serializedList.length; i += 2) {
      final key = serializedList[i] as String;
      final value = serializedList[i + 1];
      switch (key) {
        case r'success':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(bool),
          ) as bool;
          result.success = valueDes;
          break;
        case r'data':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(RedeemInviteResponseData),
          ) as RedeemInviteResponseData;
          result.data.replace(valueDes);
          break;
        case r'timestamp':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(DateTime),
          ) as DateTime;
          result.timestamp = valueDes;
          break;
        default:
          unhandled.add(key);
          unhandled.add(value);
          break;
      }
    }
  }

  @override
  RedeemInviteResponse deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = RedeemInviteResponseBuilder();
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
