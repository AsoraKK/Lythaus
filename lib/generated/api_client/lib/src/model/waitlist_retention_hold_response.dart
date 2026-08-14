//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'waitlist_retention_hold_response.g.dart';

/// WaitlistRetentionHoldResponse
///
/// Properties:
/// * [id]
/// * [retentionHold]
@BuiltValue()
abstract class WaitlistRetentionHoldResponse implements Built<WaitlistRetentionHoldResponse, WaitlistRetentionHoldResponseBuilder> {
  @BuiltValueField(wireName: r'id')
  String get id;

  @BuiltValueField(wireName: r'retentionHold')
  bool get retentionHold;

  WaitlistRetentionHoldResponse._();

  factory WaitlistRetentionHoldResponse([void updates(WaitlistRetentionHoldResponseBuilder b)]) = _$WaitlistRetentionHoldResponse;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(WaitlistRetentionHoldResponseBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<WaitlistRetentionHoldResponse> get serializer => _$WaitlistRetentionHoldResponseSerializer();
}

class _$WaitlistRetentionHoldResponseSerializer implements PrimitiveSerializer<WaitlistRetentionHoldResponse> {
  @override
  final Iterable<Type> types = const [WaitlistRetentionHoldResponse, _$WaitlistRetentionHoldResponse];

  @override
  final String wireName = r'WaitlistRetentionHoldResponse';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    WaitlistRetentionHoldResponse object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    yield r'id';
    yield serializers.serialize(
      object.id,
      specifiedType: const FullType(String),
    );
    yield r'retentionHold';
    yield serializers.serialize(
      object.retentionHold,
      specifiedType: const FullType(bool),
    );
  }

  @override
  Object serialize(
    Serializers serializers,
    WaitlistRetentionHoldResponse object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required WaitlistRetentionHoldResponseBuilder result,
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
        case r'retentionHold':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(bool),
          ) as bool;
          result.retentionHold = valueDes;
          break;
        default:
          unhandled.add(key);
          unhandled.add(value);
          break;
      }
    }
  }

  @override
  WaitlistRetentionHoldResponse deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = WaitlistRetentionHoldResponseBuilder();
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
