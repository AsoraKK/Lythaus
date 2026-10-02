//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:built_collection/built_collection.dart';
import 'package:lythaus_api_client/src/model/overview_provider_accounting_period.dart';
import 'package:built_value/json_object.dart';
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'overview_provider.g.dart';

/// OverviewProvider
///
/// Properties:
/// * [enabled]
/// * [status]
/// * [reason]
/// * [sampledAt]
/// * [requests]
/// * [errors]
/// * [latencyMs]
/// * [queues]
/// * [storageBytes]
/// * [connections]
/// * [queryLatencyMs]
/// * [accruedCost] - Accrued estimate only after attribution and currency are verified.
/// * [finalizedCost] - Finalized invoice amount separately from accrued estimates.
/// * [currency]
/// * [accountingPeriod]
@BuiltValue()
abstract class OverviewProvider implements Built<OverviewProvider, OverviewProviderBuilder> {
  @BuiltValueField(wireName: r'enabled')
  bool get enabled;

  @BuiltValueField(wireName: r'status')
  OverviewProviderStatusEnum get status;
  // enum statusEnum {  available,  unavailable,  };

  @BuiltValueField(wireName: r'reason')
  String get reason;

  @BuiltValueField(wireName: r'sampledAt')
  DateTime? get sampledAt;

  @BuiltValueField(wireName: r'requests')
  num? get requests;

  @BuiltValueField(wireName: r'errors')
  num? get errors;

  @BuiltValueField(wireName: r'latencyMs')
  num? get latencyMs;

  @BuiltValueField(wireName: r'queues')
  BuiltMap<String, JsonObject?>? get queues;

  @BuiltValueField(wireName: r'storageBytes')
  num? get storageBytes;

  @BuiltValueField(wireName: r'connections')
  num? get connections;

  @BuiltValueField(wireName: r'queryLatencyMs')
  num? get queryLatencyMs;

  /// Accrued estimate only after attribution and currency are verified.
  @BuiltValueField(wireName: r'accruedCost')
  num? get accruedCost;

  /// Finalized invoice amount separately from accrued estimates.
  @BuiltValueField(wireName: r'finalizedCost')
  num? get finalizedCost;

  @BuiltValueField(wireName: r'currency')
  String? get currency;

  @BuiltValueField(wireName: r'accountingPeriod')
  OverviewProviderAccountingPeriod? get accountingPeriod;

  OverviewProvider._();

  factory OverviewProvider([void updates(OverviewProviderBuilder b)]) = _$OverviewProvider;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(OverviewProviderBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<OverviewProvider> get serializer => _$OverviewProviderSerializer();
}

class _$OverviewProviderSerializer implements PrimitiveSerializer<OverviewProvider> {
  @override
  final Iterable<Type> types = const [OverviewProvider, _$OverviewProvider];

  @override
  final String wireName = r'OverviewProvider';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    OverviewProvider object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    yield r'enabled';
    yield serializers.serialize(
      object.enabled,
      specifiedType: const FullType(bool),
    );
    yield r'status';
    yield serializers.serialize(
      object.status,
      specifiedType: const FullType(OverviewProviderStatusEnum),
    );
    yield r'reason';
    yield serializers.serialize(
      object.reason,
      specifiedType: const FullType(String),
    );
    yield r'sampledAt';
    yield object.sampledAt == null ? null : serializers.serialize(
      object.sampledAt,
      specifiedType: const FullType.nullable(DateTime),
    );
    if (object.requests != null) {
      yield r'requests';
      yield serializers.serialize(
        object.requests,
        specifiedType: const FullType.nullable(num),
      );
    }
    if (object.errors != null) {
      yield r'errors';
      yield serializers.serialize(
        object.errors,
        specifiedType: const FullType.nullable(num),
      );
    }
    if (object.latencyMs != null) {
      yield r'latencyMs';
      yield serializers.serialize(
        object.latencyMs,
        specifiedType: const FullType.nullable(num),
      );
    }
    if (object.queues != null) {
      yield r'queues';
      yield serializers.serialize(
        object.queues,
        specifiedType: const FullType.nullable(BuiltMap, [FullType(String), FullType.nullable(JsonObject)]),
      );
    }
    if (object.storageBytes != null) {
      yield r'storageBytes';
      yield serializers.serialize(
        object.storageBytes,
        specifiedType: const FullType.nullable(num),
      );
    }
    if (object.connections != null) {
      yield r'connections';
      yield serializers.serialize(
        object.connections,
        specifiedType: const FullType.nullable(num),
      );
    }
    if (object.queryLatencyMs != null) {
      yield r'queryLatencyMs';
      yield serializers.serialize(
        object.queryLatencyMs,
        specifiedType: const FullType.nullable(num),
      );
    }
    yield r'accruedCost';
    yield object.accruedCost == null ? null : serializers.serialize(
      object.accruedCost,
      specifiedType: const FullType.nullable(num),
    );
    yield r'finalizedCost';
    yield object.finalizedCost == null ? null : serializers.serialize(
      object.finalizedCost,
      specifiedType: const FullType.nullable(num),
    );
    yield r'currency';
    yield object.currency == null ? null : serializers.serialize(
      object.currency,
      specifiedType: const FullType.nullable(String),
    );
    yield r'accountingPeriod';
    yield object.accountingPeriod == null ? null : serializers.serialize(
      object.accountingPeriod,
      specifiedType: const FullType.nullable(OverviewProviderAccountingPeriod),
    );
  }

  @override
  Object serialize(
    Serializers serializers,
    OverviewProvider object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required OverviewProviderBuilder result,
    required List<Object?> unhandled,
  }) {
    for (var i = 0; i < serializedList.length; i += 2) {
      final key = serializedList[i] as String;
      final value = serializedList[i + 1];
      switch (key) {
        case r'enabled':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(bool),
          ) as bool;
          result.enabled = valueDes;
          break;
        case r'status':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(OverviewProviderStatusEnum),
          ) as OverviewProviderStatusEnum;
          result.status = valueDes;
          break;
        case r'reason':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.reason = valueDes;
          break;
        case r'sampledAt':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType.nullable(DateTime),
          ) as DateTime?;
          if (valueDes == null) continue;
          result.sampledAt = valueDes;
          break;
        case r'requests':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType.nullable(num),
          ) as num?;
          if (valueDes == null) continue;
          result.requests = valueDes;
          break;
        case r'errors':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType.nullable(num),
          ) as num?;
          if (valueDes == null) continue;
          result.errors = valueDes;
          break;
        case r'latencyMs':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType.nullable(num),
          ) as num?;
          if (valueDes == null) continue;
          result.latencyMs = valueDes;
          break;
        case r'queues':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType.nullable(BuiltMap, [FullType(String), FullType.nullable(JsonObject)]),
          ) as BuiltMap<String, JsonObject?>?;
          if (valueDes == null) continue;
          result.queues.replace(valueDes);
          break;
        case r'storageBytes':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType.nullable(num),
          ) as num?;
          if (valueDes == null) continue;
          result.storageBytes = valueDes;
          break;
        case r'connections':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType.nullable(num),
          ) as num?;
          if (valueDes == null) continue;
          result.connections = valueDes;
          break;
        case r'queryLatencyMs':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType.nullable(num),
          ) as num?;
          if (valueDes == null) continue;
          result.queryLatencyMs = valueDes;
          break;
        case r'accruedCost':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType.nullable(num),
          ) as num?;
          if (valueDes == null) continue;
          result.accruedCost = valueDes;
          break;
        case r'finalizedCost':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType.nullable(num),
          ) as num?;
          if (valueDes == null) continue;
          result.finalizedCost = valueDes;
          break;
        case r'currency':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType.nullable(String),
          ) as String?;
          if (valueDes == null) continue;
          result.currency = valueDes;
          break;
        case r'accountingPeriod':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType.nullable(OverviewProviderAccountingPeriod),
          ) as OverviewProviderAccountingPeriod?;
          if (valueDes == null) continue;
          result.accountingPeriod.replace(valueDes);
          break;
        default:
          unhandled.add(key);
          unhandled.add(value);
          break;
      }
    }
  }

  @override
  OverviewProvider deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = OverviewProviderBuilder();
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

class OverviewProviderStatusEnum extends EnumClass {

  @BuiltValueEnumConst(wireName: r'available')
  static const OverviewProviderStatusEnum available = _$overviewProviderStatusEnum_available;
  @BuiltValueEnumConst(wireName: r'unavailable')
  static const OverviewProviderStatusEnum unavailable = _$overviewProviderStatusEnum_unavailable;

  static Serializer<OverviewProviderStatusEnum> get serializer => _$overviewProviderStatusEnumSerializer;

  const OverviewProviderStatusEnum._(String name): super(name);

  static BuiltSet<OverviewProviderStatusEnum> get values => _$overviewProviderStatusEnumValues;
  static OverviewProviderStatusEnum valueOf(String name) => _$overviewProviderStatusEnumValueOf(name);
}
