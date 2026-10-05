//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:built_collection/built_collection.dart';
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'passkey_maintenance.g.dart';

/// PasskeyMaintenance
///
/// Properties:
/// * [verified]
/// * [evidenceRecorded]
/// * [points]
@BuiltValue()
abstract class PasskeyMaintenance implements Built<PasskeyMaintenance, PasskeyMaintenanceBuilder> {
  @BuiltValueField(wireName: r'verified')
  bool get verified;

  @BuiltValueField(wireName: r'evidenceRecorded')
  bool get evidenceRecorded;

  @BuiltValueField(wireName: r'points')
  PasskeyMaintenancePointsEnum get points;
  // enum pointsEnum {  0,  };

  PasskeyMaintenance._();

  factory PasskeyMaintenance([void updates(PasskeyMaintenanceBuilder b)]) = _$PasskeyMaintenance;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(PasskeyMaintenanceBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<PasskeyMaintenance> get serializer => _$PasskeyMaintenanceSerializer();
}

class _$PasskeyMaintenanceSerializer implements PrimitiveSerializer<PasskeyMaintenance> {
  @override
  final Iterable<Type> types = const [PasskeyMaintenance, _$PasskeyMaintenance];

  @override
  final String wireName = r'PasskeyMaintenance';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    PasskeyMaintenance object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    yield r'verified';
    yield serializers.serialize(
      object.verified,
      specifiedType: const FullType(bool),
    );
    yield r'evidenceRecorded';
    yield serializers.serialize(
      object.evidenceRecorded,
      specifiedType: const FullType(bool),
    );
    yield r'points';
    yield serializers.serialize(
      object.points,
      specifiedType: const FullType(PasskeyMaintenancePointsEnum),
    );
  }

  @override
  Object serialize(
    Serializers serializers,
    PasskeyMaintenance object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required PasskeyMaintenanceBuilder result,
    required List<Object?> unhandled,
  }) {
    for (var i = 0; i < serializedList.length; i += 2) {
      final key = serializedList[i] as String;
      final value = serializedList[i + 1];
      switch (key) {
        case r'verified':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(bool),
          ) as bool;
          result.verified = valueDes;
          break;
        case r'evidenceRecorded':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(bool),
          ) as bool;
          result.evidenceRecorded = valueDes;
          break;
        case r'points':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(PasskeyMaintenancePointsEnum),
          ) as PasskeyMaintenancePointsEnum;
          result.points = valueDes;
          break;
        default:
          unhandled.add(key);
          unhandled.add(value);
          break;
      }
    }
  }

  @override
  PasskeyMaintenance deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = PasskeyMaintenanceBuilder();
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

class PasskeyMaintenancePointsEnum extends EnumClass {

  @BuiltValueEnumConst(wireNumber: 0)
  static const PasskeyMaintenancePointsEnum number0 = _$passkeyMaintenancePointsEnum_number0;

  static Serializer<PasskeyMaintenancePointsEnum> get serializer => _$passkeyMaintenancePointsEnumSerializer;

  const PasskeyMaintenancePointsEnum._(String name): super(name);

  static BuiltSet<PasskeyMaintenancePointsEnum> get values => _$passkeyMaintenancePointsEnumValues;
  static PasskeyMaintenancePointsEnum valueOf(String name) => _$passkeyMaintenancePointsEnumValueOf(name);
}
