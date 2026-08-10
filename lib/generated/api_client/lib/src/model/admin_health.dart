//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:built_collection/built_collection.dart';
import 'package:built_value/json_object.dart';
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'admin_health.g.dart';

/// AdminHealth
///
/// Properties:
/// * [status]
/// * [database]
@BuiltValue()
abstract class AdminHealth implements Built<AdminHealth, AdminHealthBuilder> {
  @BuiltValueField(wireName: r'status')
  AdminHealthStatusEnum get status;
  // enum statusEnum {  ok,  };

  @BuiltValueField(wireName: r'database')
  BuiltMap<String, JsonObject?> get database;

  AdminHealth._();

  factory AdminHealth([void updates(AdminHealthBuilder b)]) = _$AdminHealth;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(AdminHealthBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<AdminHealth> get serializer => _$AdminHealthSerializer();
}

class _$AdminHealthSerializer implements PrimitiveSerializer<AdminHealth> {
  @override
  final Iterable<Type> types = const [AdminHealth, _$AdminHealth];

  @override
  final String wireName = r'AdminHealth';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    AdminHealth object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    yield r'status';
    yield serializers.serialize(
      object.status,
      specifiedType: const FullType(AdminHealthStatusEnum),
    );
    yield r'database';
    yield serializers.serialize(
      object.database,
      specifiedType: const FullType(BuiltMap, [FullType(String), FullType.nullable(JsonObject)]),
    );
  }

  @override
  Object serialize(
    Serializers serializers,
    AdminHealth object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required AdminHealthBuilder result,
    required List<Object?> unhandled,
  }) {
    for (var i = 0; i < serializedList.length; i += 2) {
      final key = serializedList[i] as String;
      final value = serializedList[i + 1];
      switch (key) {
        case r'status':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(AdminHealthStatusEnum),
          ) as AdminHealthStatusEnum;
          result.status = valueDes;
          break;
        case r'database':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(BuiltMap, [FullType(String), FullType.nullable(JsonObject)]),
          ) as BuiltMap<String, JsonObject?>;
          result.database.replace(valueDes);
          break;
        default:
          unhandled.add(key);
          unhandled.add(value);
          break;
      }
    }
  }

  @override
  AdminHealth deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = AdminHealthBuilder();
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

class AdminHealthStatusEnum extends EnumClass {

  @BuiltValueEnumConst(wireName: r'ok')
  static const AdminHealthStatusEnum ok = _$adminHealthStatusEnum_ok;

  static Serializer<AdminHealthStatusEnum> get serializer => _$adminHealthStatusEnumSerializer;

  const AdminHealthStatusEnum._(String name): super(name);

  static BuiltSet<AdminHealthStatusEnum> get values => _$adminHealthStatusEnumValues;
  static AdminHealthStatusEnum valueOf(String name) => _$adminHealthStatusEnumValueOf(name);
}
