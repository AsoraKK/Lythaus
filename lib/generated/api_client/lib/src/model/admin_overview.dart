//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:lythaus_api_client/src/model/admin_overview_providers.dart';
import 'package:lythaus_api_client/src/model/admin_overview_metrics.dart';
import 'package:built_collection/built_collection.dart';
import 'package:lythaus_api_client/src/model/admin_overview_gaps.dart';
import 'package:lythaus_api_client/src/model/overview_window.dart';
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'admin_overview.g.dart';

/// AdminOverview
///
/// Properties:
/// * [contractVersion]
/// * [timezone]
/// * [sampledAt]
/// * [period]
/// * [current]
/// * [previous]
/// * [comparable]
/// * [coverage]
/// * [cacheTtlSeconds]
/// * [rowLimit]
/// * [metrics]
/// * [gaps]
/// * [providers]
/// * [correlationId]
@BuiltValue()
abstract class AdminOverview implements Built<AdminOverview, AdminOverviewBuilder> {
  @BuiltValueField(wireName: r'contractVersion')
  AdminOverviewContractVersionEnum get contractVersion;
  // enum contractVersionEnum {  overview-v1,  };

  @BuiltValueField(wireName: r'timezone')
  AdminOverviewTimezoneEnum get timezone;
  // enum timezoneEnum {  UTC,  };

  @BuiltValueField(wireName: r'sampledAt')
  DateTime get sampledAt;

  @BuiltValueField(wireName: r'period')
  AdminOverviewPeriodEnum get period;
  // enum periodEnum {  today,  mtd,  ytd,  };

  @BuiltValueField(wireName: r'current')
  OverviewWindow get current;

  @BuiltValueField(wireName: r'previous')
  OverviewWindow get previous;

  @BuiltValueField(wireName: r'comparable')
  bool get comparable;

  @BuiltValueField(wireName: r'coverage')
  AdminOverviewCoverageEnum get coverage;
  // enum coverageEnum {  retained_current_state,  };

  @BuiltValueField(wireName: r'cacheTtlSeconds')
  AdminOverviewCacheTtlSecondsEnum get cacheTtlSeconds;
  // enum cacheTtlSecondsEnum {  60,  };

  @BuiltValueField(wireName: r'rowLimit')
  AdminOverviewRowLimitEnum get rowLimit;
  // enum rowLimitEnum {  5000,  };

  @BuiltValueField(wireName: r'metrics')
  AdminOverviewMetrics get metrics;

  @BuiltValueField(wireName: r'gaps')
  AdminOverviewGaps get gaps;

  @BuiltValueField(wireName: r'providers')
  AdminOverviewProviders get providers;

  @BuiltValueField(wireName: r'correlationId')
  String get correlationId;

  AdminOverview._();

  factory AdminOverview([void updates(AdminOverviewBuilder b)]) = _$AdminOverview;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(AdminOverviewBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<AdminOverview> get serializer => _$AdminOverviewSerializer();
}

class _$AdminOverviewSerializer implements PrimitiveSerializer<AdminOverview> {
  @override
  final Iterable<Type> types = const [AdminOverview, _$AdminOverview];

  @override
  final String wireName = r'AdminOverview';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    AdminOverview object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    yield r'contractVersion';
    yield serializers.serialize(
      object.contractVersion,
      specifiedType: const FullType(AdminOverviewContractVersionEnum),
    );
    yield r'timezone';
    yield serializers.serialize(
      object.timezone,
      specifiedType: const FullType(AdminOverviewTimezoneEnum),
    );
    yield r'sampledAt';
    yield serializers.serialize(
      object.sampledAt,
      specifiedType: const FullType(DateTime),
    );
    yield r'period';
    yield serializers.serialize(
      object.period,
      specifiedType: const FullType(AdminOverviewPeriodEnum),
    );
    yield r'current';
    yield serializers.serialize(
      object.current,
      specifiedType: const FullType(OverviewWindow),
    );
    yield r'previous';
    yield serializers.serialize(
      object.previous,
      specifiedType: const FullType(OverviewWindow),
    );
    yield r'comparable';
    yield serializers.serialize(
      object.comparable,
      specifiedType: const FullType(bool),
    );
    yield r'coverage';
    yield serializers.serialize(
      object.coverage,
      specifiedType: const FullType(AdminOverviewCoverageEnum),
    );
    yield r'cacheTtlSeconds';
    yield serializers.serialize(
      object.cacheTtlSeconds,
      specifiedType: const FullType(AdminOverviewCacheTtlSecondsEnum),
    );
    yield r'rowLimit';
    yield serializers.serialize(
      object.rowLimit,
      specifiedType: const FullType(AdminOverviewRowLimitEnum),
    );
    yield r'metrics';
    yield serializers.serialize(
      object.metrics,
      specifiedType: const FullType(AdminOverviewMetrics),
    );
    yield r'gaps';
    yield serializers.serialize(
      object.gaps,
      specifiedType: const FullType(AdminOverviewGaps),
    );
    yield r'providers';
    yield serializers.serialize(
      object.providers,
      specifiedType: const FullType(AdminOverviewProviders),
    );
    yield r'correlationId';
    yield serializers.serialize(
      object.correlationId,
      specifiedType: const FullType(String),
    );
  }

  @override
  Object serialize(
    Serializers serializers,
    AdminOverview object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required AdminOverviewBuilder result,
    required List<Object?> unhandled,
  }) {
    for (var i = 0; i < serializedList.length; i += 2) {
      final key = serializedList[i] as String;
      final value = serializedList[i + 1];
      switch (key) {
        case r'contractVersion':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(AdminOverviewContractVersionEnum),
          ) as AdminOverviewContractVersionEnum;
          result.contractVersion = valueDes;
          break;
        case r'timezone':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(AdminOverviewTimezoneEnum),
          ) as AdminOverviewTimezoneEnum;
          result.timezone = valueDes;
          break;
        case r'sampledAt':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(DateTime),
          ) as DateTime;
          result.sampledAt = valueDes;
          break;
        case r'period':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(AdminOverviewPeriodEnum),
          ) as AdminOverviewPeriodEnum;
          result.period = valueDes;
          break;
        case r'current':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(OverviewWindow),
          ) as OverviewWindow;
          result.current.replace(valueDes);
          break;
        case r'previous':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(OverviewWindow),
          ) as OverviewWindow;
          result.previous.replace(valueDes);
          break;
        case r'comparable':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(bool),
          ) as bool;
          result.comparable = valueDes;
          break;
        case r'coverage':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(AdminOverviewCoverageEnum),
          ) as AdminOverviewCoverageEnum;
          result.coverage = valueDes;
          break;
        case r'cacheTtlSeconds':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(AdminOverviewCacheTtlSecondsEnum),
          ) as AdminOverviewCacheTtlSecondsEnum;
          result.cacheTtlSeconds = valueDes;
          break;
        case r'rowLimit':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(AdminOverviewRowLimitEnum),
          ) as AdminOverviewRowLimitEnum;
          result.rowLimit = valueDes;
          break;
        case r'metrics':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(AdminOverviewMetrics),
          ) as AdminOverviewMetrics;
          result.metrics.replace(valueDes);
          break;
        case r'gaps':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(AdminOverviewGaps),
          ) as AdminOverviewGaps;
          result.gaps.replace(valueDes);
          break;
        case r'providers':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(AdminOverviewProviders),
          ) as AdminOverviewProviders;
          result.providers.replace(valueDes);
          break;
        case r'correlationId':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.correlationId = valueDes;
          break;
        default:
          unhandled.add(key);
          unhandled.add(value);
          break;
      }
    }
  }

  @override
  AdminOverview deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = AdminOverviewBuilder();
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

class AdminOverviewContractVersionEnum extends EnumClass {

  @BuiltValueEnumConst(wireName: r'overview-v1')
  static const AdminOverviewContractVersionEnum overviewV1 = _$adminOverviewContractVersionEnum_overviewV1;

  static Serializer<AdminOverviewContractVersionEnum> get serializer => _$adminOverviewContractVersionEnumSerializer;

  const AdminOverviewContractVersionEnum._(String name): super(name);

  static BuiltSet<AdminOverviewContractVersionEnum> get values => _$adminOverviewContractVersionEnumValues;
  static AdminOverviewContractVersionEnum valueOf(String name) => _$adminOverviewContractVersionEnumValueOf(name);
}

class AdminOverviewTimezoneEnum extends EnumClass {

  @BuiltValueEnumConst(wireName: r'UTC')
  static const AdminOverviewTimezoneEnum UTC = _$adminOverviewTimezoneEnum_UTC;

  static Serializer<AdminOverviewTimezoneEnum> get serializer => _$adminOverviewTimezoneEnumSerializer;

  const AdminOverviewTimezoneEnum._(String name): super(name);

  static BuiltSet<AdminOverviewTimezoneEnum> get values => _$adminOverviewTimezoneEnumValues;
  static AdminOverviewTimezoneEnum valueOf(String name) => _$adminOverviewTimezoneEnumValueOf(name);
}

class AdminOverviewPeriodEnum extends EnumClass {

  @BuiltValueEnumConst(wireName: r'today')
  static const AdminOverviewPeriodEnum today = _$adminOverviewPeriodEnum_today;
  @BuiltValueEnumConst(wireName: r'mtd')
  static const AdminOverviewPeriodEnum mtd = _$adminOverviewPeriodEnum_mtd;
  @BuiltValueEnumConst(wireName: r'ytd')
  static const AdminOverviewPeriodEnum ytd = _$adminOverviewPeriodEnum_ytd;

  static Serializer<AdminOverviewPeriodEnum> get serializer => _$adminOverviewPeriodEnumSerializer;

  const AdminOverviewPeriodEnum._(String name): super(name);

  static BuiltSet<AdminOverviewPeriodEnum> get values => _$adminOverviewPeriodEnumValues;
  static AdminOverviewPeriodEnum valueOf(String name) => _$adminOverviewPeriodEnumValueOf(name);
}

class AdminOverviewCoverageEnum extends EnumClass {

  @BuiltValueEnumConst(wireName: r'retained_current_state')
  static const AdminOverviewCoverageEnum retainedCurrentState = _$adminOverviewCoverageEnum_retainedCurrentState;

  static Serializer<AdminOverviewCoverageEnum> get serializer => _$adminOverviewCoverageEnumSerializer;

  const AdminOverviewCoverageEnum._(String name): super(name);

  static BuiltSet<AdminOverviewCoverageEnum> get values => _$adminOverviewCoverageEnumValues;
  static AdminOverviewCoverageEnum valueOf(String name) => _$adminOverviewCoverageEnumValueOf(name);
}

class AdminOverviewCacheTtlSecondsEnum extends EnumClass {

  @BuiltValueEnumConst(wireNumber: 60)
  static const AdminOverviewCacheTtlSecondsEnum number60 = _$adminOverviewCacheTtlSecondsEnum_number60;

  static Serializer<AdminOverviewCacheTtlSecondsEnum> get serializer => _$adminOverviewCacheTtlSecondsEnumSerializer;

  const AdminOverviewCacheTtlSecondsEnum._(String name): super(name);

  static BuiltSet<AdminOverviewCacheTtlSecondsEnum> get values => _$adminOverviewCacheTtlSecondsEnumValues;
  static AdminOverviewCacheTtlSecondsEnum valueOf(String name) => _$adminOverviewCacheTtlSecondsEnumValueOf(name);
}

class AdminOverviewRowLimitEnum extends EnumClass {

  @BuiltValueEnumConst(wireNumber: 5000)
  static const AdminOverviewRowLimitEnum number5000 = _$adminOverviewRowLimitEnum_number5000;

  static Serializer<AdminOverviewRowLimitEnum> get serializer => _$adminOverviewRowLimitEnumSerializer;

  const AdminOverviewRowLimitEnum._(String name): super(name);

  static BuiltSet<AdminOverviewRowLimitEnum> get values => _$adminOverviewRowLimitEnumValues;
  static AdminOverviewRowLimitEnum valueOf(String name) => _$adminOverviewRowLimitEnumValueOf(name);
}
