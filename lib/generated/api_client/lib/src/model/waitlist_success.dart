//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:built_collection/built_collection.dart';
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'waitlist_success.g.dart';

/// WaitlistSuccess
///
/// Properties:
/// * [ok]
/// * [status]
@BuiltValue()
abstract class WaitlistSuccess implements Built<WaitlistSuccess, WaitlistSuccessBuilder> {
  @BuiltValueField(wireName: r'ok')
  bool get ok;

  @BuiltValueField(wireName: r'status')
  WaitlistSuccessStatusEnum get status;
  // enum statusEnum {  waitlisted,  };

  WaitlistSuccess._();

  factory WaitlistSuccess([void updates(WaitlistSuccessBuilder b)]) = _$WaitlistSuccess;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(WaitlistSuccessBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<WaitlistSuccess> get serializer => _$WaitlistSuccessSerializer();
}

class _$WaitlistSuccessSerializer implements PrimitiveSerializer<WaitlistSuccess> {
  @override
  final Iterable<Type> types = const [WaitlistSuccess, _$WaitlistSuccess];

  @override
  final String wireName = r'WaitlistSuccess';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    WaitlistSuccess object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    yield r'ok';
    yield serializers.serialize(
      object.ok,
      specifiedType: const FullType(bool),
    );
    yield r'status';
    yield serializers.serialize(
      object.status,
      specifiedType: const FullType(WaitlistSuccessStatusEnum),
    );
  }

  @override
  Object serialize(
    Serializers serializers,
    WaitlistSuccess object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required WaitlistSuccessBuilder result,
    required List<Object?> unhandled,
  }) {
    for (var i = 0; i < serializedList.length; i += 2) {
      final key = serializedList[i] as String;
      final value = serializedList[i + 1];
      switch (key) {
        case r'ok':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(bool),
          ) as bool;
          result.ok = valueDes;
          break;
        case r'status':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(WaitlistSuccessStatusEnum),
          ) as WaitlistSuccessStatusEnum;
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
  WaitlistSuccess deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = WaitlistSuccessBuilder();
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

class WaitlistSuccessStatusEnum extends EnumClass {

  @BuiltValueEnumConst(wireName: r'waitlisted')
  static const WaitlistSuccessStatusEnum waitlisted = _$waitlistSuccessStatusEnum_waitlisted;

  static Serializer<WaitlistSuccessStatusEnum> get serializer => _$waitlistSuccessStatusEnumSerializer;

  const WaitlistSuccessStatusEnum._(String name): super(name);

  static BuiltSet<WaitlistSuccessStatusEnum> get values => _$waitlistSuccessStatusEnumValues;
  static WaitlistSuccessStatusEnum valueOf(String name) => _$waitlistSuccessStatusEnumValueOf(name);
}
