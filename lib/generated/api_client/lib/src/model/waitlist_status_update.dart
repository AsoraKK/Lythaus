//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:built_collection/built_collection.dart';
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'waitlist_status_update.g.dart';

/// WaitlistStatusUpdate
///
/// Properties:
/// * [status]
@BuiltValue()
abstract class WaitlistStatusUpdate implements Built<WaitlistStatusUpdate, WaitlistStatusUpdateBuilder> {
  @BuiltValueField(wireName: r'status')
  WaitlistStatusUpdateStatusEnum get status;
  // enum statusEnum {  waiting,  invited,  converted,  unsubscribed,  };

  WaitlistStatusUpdate._();

  factory WaitlistStatusUpdate([void updates(WaitlistStatusUpdateBuilder b)]) = _$WaitlistStatusUpdate;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(WaitlistStatusUpdateBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<WaitlistStatusUpdate> get serializer => _$WaitlistStatusUpdateSerializer();
}

class _$WaitlistStatusUpdateSerializer implements PrimitiveSerializer<WaitlistStatusUpdate> {
  @override
  final Iterable<Type> types = const [WaitlistStatusUpdate, _$WaitlistStatusUpdate];

  @override
  final String wireName = r'WaitlistStatusUpdate';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    WaitlistStatusUpdate object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    yield r'status';
    yield serializers.serialize(
      object.status,
      specifiedType: const FullType(WaitlistStatusUpdateStatusEnum),
    );
  }

  @override
  Object serialize(
    Serializers serializers,
    WaitlistStatusUpdate object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required WaitlistStatusUpdateBuilder result,
    required List<Object?> unhandled,
  }) {
    for (var i = 0; i < serializedList.length; i += 2) {
      final key = serializedList[i] as String;
      final value = serializedList[i + 1];
      switch (key) {
        case r'status':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(WaitlistStatusUpdateStatusEnum),
          ) as WaitlistStatusUpdateStatusEnum;
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
  WaitlistStatusUpdate deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = WaitlistStatusUpdateBuilder();
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

class WaitlistStatusUpdateStatusEnum extends EnumClass {

  @BuiltValueEnumConst(wireName: r'waiting')
  static const WaitlistStatusUpdateStatusEnum waiting = _$waitlistStatusUpdateStatusEnum_waiting;
  @BuiltValueEnumConst(wireName: r'invited')
  static const WaitlistStatusUpdateStatusEnum invited = _$waitlistStatusUpdateStatusEnum_invited;
  @BuiltValueEnumConst(wireName: r'converted')
  static const WaitlistStatusUpdateStatusEnum converted = _$waitlistStatusUpdateStatusEnum_converted;
  @BuiltValueEnumConst(wireName: r'unsubscribed')
  static const WaitlistStatusUpdateStatusEnum unsubscribed = _$waitlistStatusUpdateStatusEnum_unsubscribed;

  static Serializer<WaitlistStatusUpdateStatusEnum> get serializer => _$waitlistStatusUpdateStatusEnumSerializer;

  const WaitlistStatusUpdateStatusEnum._(String name): super(name);

  static BuiltSet<WaitlistStatusUpdateStatusEnum> get values => _$waitlistStatusUpdateStatusEnumValues;
  static WaitlistStatusUpdateStatusEnum valueOf(String name) => _$waitlistStatusUpdateStatusEnumValueOf(name);
}
