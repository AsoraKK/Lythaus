//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:built_collection/built_collection.dart';
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'waitlist_status_response.g.dart';

/// WaitlistStatusResponse
///
/// Properties:
/// * [id]
/// * [status]
@BuiltValue()
abstract class WaitlistStatusResponse implements Built<WaitlistStatusResponse, WaitlistStatusResponseBuilder> {
  @BuiltValueField(wireName: r'id')
  String get id;

  @BuiltValueField(wireName: r'status')
  WaitlistStatusResponseStatusEnum get status;
  // enum statusEnum {  waiting,  invited,  converted,  unsubscribed,  };

  WaitlistStatusResponse._();

  factory WaitlistStatusResponse([void updates(WaitlistStatusResponseBuilder b)]) = _$WaitlistStatusResponse;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(WaitlistStatusResponseBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<WaitlistStatusResponse> get serializer => _$WaitlistStatusResponseSerializer();
}

class _$WaitlistStatusResponseSerializer implements PrimitiveSerializer<WaitlistStatusResponse> {
  @override
  final Iterable<Type> types = const [WaitlistStatusResponse, _$WaitlistStatusResponse];

  @override
  final String wireName = r'WaitlistStatusResponse';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    WaitlistStatusResponse object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    yield r'id';
    yield serializers.serialize(
      object.id,
      specifiedType: const FullType(String),
    );
    yield r'status';
    yield serializers.serialize(
      object.status,
      specifiedType: const FullType(WaitlistStatusResponseStatusEnum),
    );
  }

  @override
  Object serialize(
    Serializers serializers,
    WaitlistStatusResponse object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required WaitlistStatusResponseBuilder result,
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
        case r'status':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(WaitlistStatusResponseStatusEnum),
          ) as WaitlistStatusResponseStatusEnum;
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
  WaitlistStatusResponse deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = WaitlistStatusResponseBuilder();
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

class WaitlistStatusResponseStatusEnum extends EnumClass {

  @BuiltValueEnumConst(wireName: r'waiting')
  static const WaitlistStatusResponseStatusEnum waiting = _$waitlistStatusResponseStatusEnum_waiting;
  @BuiltValueEnumConst(wireName: r'invited')
  static const WaitlistStatusResponseStatusEnum invited = _$waitlistStatusResponseStatusEnum_invited;
  @BuiltValueEnumConst(wireName: r'converted')
  static const WaitlistStatusResponseStatusEnum converted = _$waitlistStatusResponseStatusEnum_converted;
  @BuiltValueEnumConst(wireName: r'unsubscribed')
  static const WaitlistStatusResponseStatusEnum unsubscribed = _$waitlistStatusResponseStatusEnum_unsubscribed;

  static Serializer<WaitlistStatusResponseStatusEnum> get serializer => _$waitlistStatusResponseStatusEnumSerializer;

  const WaitlistStatusResponseStatusEnum._(String name): super(name);

  static BuiltSet<WaitlistStatusResponseStatusEnum> get values => _$waitlistStatusResponseStatusEnumValues;
  static WaitlistStatusResponseStatusEnum valueOf(String name) => _$waitlistStatusResponseStatusEnumValueOf(name);
}
