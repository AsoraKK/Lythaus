//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:built_collection/built_collection.dart';
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'waitlist_retention_hold_update.g.dart';

/// WaitlistRetentionHoldUpdate
///
/// Properties:
/// * [active] - Whether the retention hold is active.
/// * [reasonCode]
/// * [confirmation]
@BuiltValue()
abstract class WaitlistRetentionHoldUpdate implements Built<WaitlistRetentionHoldUpdate, WaitlistRetentionHoldUpdateBuilder> {
  /// Whether the retention hold is active.
  @BuiltValueField(wireName: r'active')
  bool get active;

  @BuiltValueField(wireName: r'reasonCode')
  String get reasonCode;

  @BuiltValueField(wireName: r'confirmation')
  WaitlistRetentionHoldUpdateConfirmationEnum get confirmation;
  // enum confirmationEnum {  PLACE RETENTION HOLD,  RELEASE RETENTION HOLD,  };

  WaitlistRetentionHoldUpdate._();

  factory WaitlistRetentionHoldUpdate([void updates(WaitlistRetentionHoldUpdateBuilder b)]) = _$WaitlistRetentionHoldUpdate;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(WaitlistRetentionHoldUpdateBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<WaitlistRetentionHoldUpdate> get serializer => _$WaitlistRetentionHoldUpdateSerializer();
}

class _$WaitlistRetentionHoldUpdateSerializer implements PrimitiveSerializer<WaitlistRetentionHoldUpdate> {
  @override
  final Iterable<Type> types = const [WaitlistRetentionHoldUpdate, _$WaitlistRetentionHoldUpdate];

  @override
  final String wireName = r'WaitlistRetentionHoldUpdate';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    WaitlistRetentionHoldUpdate object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    yield r'active';
    yield serializers.serialize(
      object.active,
      specifiedType: const FullType(bool),
    );
    yield r'reasonCode';
    yield serializers.serialize(
      object.reasonCode,
      specifiedType: const FullType(String),
    );
    yield r'confirmation';
    yield serializers.serialize(
      object.confirmation,
      specifiedType: const FullType(WaitlistRetentionHoldUpdateConfirmationEnum),
    );
  }

  @override
  Object serialize(
    Serializers serializers,
    WaitlistRetentionHoldUpdate object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required WaitlistRetentionHoldUpdateBuilder result,
    required List<Object?> unhandled,
  }) {
    for (var i = 0; i < serializedList.length; i += 2) {
      final key = serializedList[i] as String;
      final value = serializedList[i + 1];
      switch (key) {
        case r'active':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(bool),
          ) as bool;
          result.active = valueDes;
          break;
        case r'reasonCode':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.reasonCode = valueDes;
          break;
        case r'confirmation':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(WaitlistRetentionHoldUpdateConfirmationEnum),
          ) as WaitlistRetentionHoldUpdateConfirmationEnum;
          result.confirmation = valueDes;
          break;
        default:
          unhandled.add(key);
          unhandled.add(value);
          break;
      }
    }
  }

  @override
  WaitlistRetentionHoldUpdate deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = WaitlistRetentionHoldUpdateBuilder();
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

class WaitlistRetentionHoldUpdateConfirmationEnum extends EnumClass {

  @BuiltValueEnumConst(wireName: r'PLACE RETENTION HOLD')
  static const WaitlistRetentionHoldUpdateConfirmationEnum pLACERETENTIONHOLD = _$waitlistRetentionHoldUpdateConfirmationEnum_pLACERETENTIONHOLD;
  @BuiltValueEnumConst(wireName: r'RELEASE RETENTION HOLD')
  static const WaitlistRetentionHoldUpdateConfirmationEnum rELEASERETENTIONHOLD = _$waitlistRetentionHoldUpdateConfirmationEnum_rELEASERETENTIONHOLD;

  static Serializer<WaitlistRetentionHoldUpdateConfirmationEnum> get serializer => _$waitlistRetentionHoldUpdateConfirmationEnumSerializer;

  const WaitlistRetentionHoldUpdateConfirmationEnum._(String name): super(name);

  static BuiltSet<WaitlistRetentionHoldUpdateConfirmationEnum> get values => _$waitlistRetentionHoldUpdateConfirmationEnumValues;
  static WaitlistRetentionHoldUpdateConfirmationEnum valueOf(String name) => _$waitlistRetentionHoldUpdateConfirmationEnumValueOf(name);
}
