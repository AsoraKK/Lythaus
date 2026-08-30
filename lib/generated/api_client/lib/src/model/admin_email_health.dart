//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:built_collection/built_collection.dart';
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'admin_email_health.g.dart';

/// AdminEmailHealth
///
/// Properties:
/// * [status]
/// * [providerLifecycle]
/// * [reason]
/// * [queued]
/// * [dispatched]
/// * [failed]
/// * [acceptedLast24Hours]
/// * [deliveredLast24Hours]
/// * [failuresLast24Hours]
/// * [lastEventAt]
@BuiltValue()
abstract class AdminEmailHealth implements Built<AdminEmailHealth, AdminEmailHealthBuilder> {
  @BuiltValueField(wireName: r'status')
  AdminEmailHealthStatusEnum get status;
  // enum statusEnum {  healthy,  degraded,  unknown,  };

  @BuiltValueField(wireName: r'providerLifecycle')
  AdminEmailHealthProviderLifecycleEnum get providerLifecycle;
  // enum providerLifecycleEnum {  available,  unavailable,  };

  @BuiltValueField(wireName: r'reason')
  String? get reason;

  @BuiltValueField(wireName: r'queued')
  int get queued;

  @BuiltValueField(wireName: r'dispatched')
  int get dispatched;

  @BuiltValueField(wireName: r'failed')
  int? get failed;

  @BuiltValueField(wireName: r'acceptedLast24Hours')
  int? get acceptedLast24Hours;

  @BuiltValueField(wireName: r'deliveredLast24Hours')
  int? get deliveredLast24Hours;

  @BuiltValueField(wireName: r'failuresLast24Hours')
  int? get failuresLast24Hours;

  @BuiltValueField(wireName: r'lastEventAt')
  DateTime? get lastEventAt;

  AdminEmailHealth._();

  factory AdminEmailHealth([void updates(AdminEmailHealthBuilder b)]) = _$AdminEmailHealth;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(AdminEmailHealthBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<AdminEmailHealth> get serializer => _$AdminEmailHealthSerializer();
}

class _$AdminEmailHealthSerializer implements PrimitiveSerializer<AdminEmailHealth> {
  @override
  final Iterable<Type> types = const [AdminEmailHealth, _$AdminEmailHealth];

  @override
  final String wireName = r'AdminEmailHealth';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    AdminEmailHealth object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    yield r'status';
    yield serializers.serialize(
      object.status,
      specifiedType: const FullType(AdminEmailHealthStatusEnum),
    );
    yield r'providerLifecycle';
    yield serializers.serialize(
      object.providerLifecycle,
      specifiedType: const FullType(AdminEmailHealthProviderLifecycleEnum),
    );
    if (object.reason != null) {
      yield r'reason';
      yield serializers.serialize(
        object.reason,
        specifiedType: const FullType.nullable(String),
      );
    }
    yield r'queued';
    yield serializers.serialize(
      object.queued,
      specifiedType: const FullType(int),
    );
    yield r'dispatched';
    yield serializers.serialize(
      object.dispatched,
      specifiedType: const FullType(int),
    );
    yield r'failed';
    yield object.failed == null ? null : serializers.serialize(
      object.failed,
      specifiedType: const FullType.nullable(int),
    );
    if (object.acceptedLast24Hours != null) {
      yield r'acceptedLast24Hours';
      yield serializers.serialize(
        object.acceptedLast24Hours,
        specifiedType: const FullType(int),
      );
    }
    if (object.deliveredLast24Hours != null) {
      yield r'deliveredLast24Hours';
      yield serializers.serialize(
        object.deliveredLast24Hours,
        specifiedType: const FullType(int),
      );
    }
    if (object.failuresLast24Hours != null) {
      yield r'failuresLast24Hours';
      yield serializers.serialize(
        object.failuresLast24Hours,
        specifiedType: const FullType(int),
      );
    }
    if (object.lastEventAt != null) {
      yield r'lastEventAt';
      yield serializers.serialize(
        object.lastEventAt,
        specifiedType: const FullType.nullable(DateTime),
      );
    }
  }

  @override
  Object serialize(
    Serializers serializers,
    AdminEmailHealth object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required AdminEmailHealthBuilder result,
    required List<Object?> unhandled,
  }) {
    for (var i = 0; i < serializedList.length; i += 2) {
      final key = serializedList[i] as String;
      final value = serializedList[i + 1];
      switch (key) {
        case r'status':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(AdminEmailHealthStatusEnum),
          ) as AdminEmailHealthStatusEnum;
          result.status = valueDes;
          break;
        case r'providerLifecycle':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(AdminEmailHealthProviderLifecycleEnum),
          ) as AdminEmailHealthProviderLifecycleEnum;
          result.providerLifecycle = valueDes;
          break;
        case r'reason':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType.nullable(String),
          ) as String?;
          if (valueDes == null) continue;
          result.reason = valueDes;
          break;
        case r'queued':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(int),
          ) as int;
          result.queued = valueDes;
          break;
        case r'dispatched':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(int),
          ) as int;
          result.dispatched = valueDes;
          break;
        case r'failed':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType.nullable(int),
          ) as int?;
          if (valueDes == null) continue;
          result.failed = valueDes;
          break;
        case r'acceptedLast24Hours':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(int),
          ) as int;
          result.acceptedLast24Hours = valueDes;
          break;
        case r'deliveredLast24Hours':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(int),
          ) as int;
          result.deliveredLast24Hours = valueDes;
          break;
        case r'failuresLast24Hours':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(int),
          ) as int;
          result.failuresLast24Hours = valueDes;
          break;
        case r'lastEventAt':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType.nullable(DateTime),
          ) as DateTime?;
          if (valueDes == null) continue;
          result.lastEventAt = valueDes;
          break;
        default:
          unhandled.add(key);
          unhandled.add(value);
          break;
      }
    }
  }

  @override
  AdminEmailHealth deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = AdminEmailHealthBuilder();
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

class AdminEmailHealthStatusEnum extends EnumClass {

  @BuiltValueEnumConst(wireName: r'healthy')
  static const AdminEmailHealthStatusEnum healthy = _$adminEmailHealthStatusEnum_healthy;
  @BuiltValueEnumConst(wireName: r'degraded')
  static const AdminEmailHealthStatusEnum degraded = _$adminEmailHealthStatusEnum_degraded;
  @BuiltValueEnumConst(wireName: r'unknown')
  static const AdminEmailHealthStatusEnum unknown = _$adminEmailHealthStatusEnum_unknown;

  static Serializer<AdminEmailHealthStatusEnum> get serializer => _$adminEmailHealthStatusEnumSerializer;

  const AdminEmailHealthStatusEnum._(String name): super(name);

  static BuiltSet<AdminEmailHealthStatusEnum> get values => _$adminEmailHealthStatusEnumValues;
  static AdminEmailHealthStatusEnum valueOf(String name) => _$adminEmailHealthStatusEnumValueOf(name);
}

class AdminEmailHealthProviderLifecycleEnum extends EnumClass {

  @BuiltValueEnumConst(wireName: r'available')
  static const AdminEmailHealthProviderLifecycleEnum available = _$adminEmailHealthProviderLifecycleEnum_available;
  @BuiltValueEnumConst(wireName: r'unavailable')
  static const AdminEmailHealthProviderLifecycleEnum unavailable = _$adminEmailHealthProviderLifecycleEnum_unavailable;

  static Serializer<AdminEmailHealthProviderLifecycleEnum> get serializer => _$adminEmailHealthProviderLifecycleEnumSerializer;

  const AdminEmailHealthProviderLifecycleEnum._(String name): super(name);

  static BuiltSet<AdminEmailHealthProviderLifecycleEnum> get values => _$adminEmailHealthProviderLifecycleEnumValues;
  static AdminEmailHealthProviderLifecycleEnum valueOf(String name) => _$adminEmailHealthProviderLifecycleEnumValueOf(name);
}
