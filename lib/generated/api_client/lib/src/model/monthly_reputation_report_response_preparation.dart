//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:lythaus_api_client/src/model/monthly_prepared_corrections.dart';
import 'package:built_collection/built_collection.dart';
import 'package:lythaus_api_client/src/model/monthly_prepared_level_authority.dart';
import 'package:lythaus_api_client/src/model/monthly_prepared_report_details.dart';
import 'package:lythaus_api_client/src/model/monthly_prepared_snapshot_projection.dart';
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'monthly_reputation_report_response_preparation.g.dart';

/// Disabled v2 report DTO for synthetic fixture and generated-client preparation. HTTP callers cannot obtain a non-null preparedResponse. Current source progress and a fixed shadow snapshot projection remain separate; confirmed authority is unavailable. Weekly geometry uses an explicitly captured proposal that remains pending owner approval.
///
/// Properties:
/// * [responseVersion]
/// * [policyVersion]
/// * [catalogueHash]
/// * [dataVersion]
/// * [preparationOnly]
/// * [runtimeActivationAllowed]
/// * [appliedPoints]
/// * [maximumSourceMonth]
/// * [responseKind]
/// * [reportState]
/// * [reasonCode]
/// * [sourceMonth]
/// * [effectiveMonth]
/// * [levelAuthority]
/// * [snapshotProjection]
/// * [corrections]
/// * [report]
@BuiltValue()
abstract class MonthlyReputationReportResponsePreparation implements Built<MonthlyReputationReportResponsePreparation, MonthlyReputationReportResponsePreparationBuilder> {
  @BuiltValueField(wireName: r'responseVersion')
  MonthlyReputationReportResponsePreparationResponseVersionEnum get responseVersion;
  // enum responseVersionEnum {  monthly-rewards-response-v2-preparation,  };

  @BuiltValueField(wireName: r'policyVersion')
  MonthlyReputationReportResponsePreparationPolicyVersionEnum get policyVersion;
  // enum policyVersionEnum {  lythaus-monthly-rewards-2026-10-v2,  };

  @BuiltValueField(wireName: r'catalogueHash')
  String get catalogueHash;

  @BuiltValueField(wireName: r'dataVersion')
  int get dataVersion;

  @BuiltValueField(wireName: r'preparationOnly')
  bool get preparationOnly;

  @BuiltValueField(wireName: r'runtimeActivationAllowed')
  bool get runtimeActivationAllowed;

  @BuiltValueField(wireName: r'appliedPoints')
  int get appliedPoints;

  @BuiltValueField(wireName: r'maximumSourceMonth')
  int get maximumSourceMonth;

  @BuiltValueField(wireName: r'responseKind')
  MonthlyReputationReportResponsePreparationResponseKindEnum get responseKind;
  // enum responseKindEnum {  monthly_reputation_report,  };

  @BuiltValueField(wireName: r'reportState')
  MonthlyReputationReportResponsePreparationReportStateEnum get reportState;
  // enum reportStateEnum {  pending,  shadow,  };

  @BuiltValueField(wireName: r'reasonCode')
  String? get reasonCode;

  @BuiltValueField(wireName: r'sourceMonth')
  String get sourceMonth;

  @BuiltValueField(wireName: r'effectiveMonth')
  String get effectiveMonth;

  @BuiltValueField(wireName: r'levelAuthority')
  MonthlyPreparedLevelAuthority get levelAuthority;

  @BuiltValueField(wireName: r'snapshotProjection')
  MonthlyPreparedSnapshotProjection? get snapshotProjection;

  @BuiltValueField(wireName: r'corrections')
  MonthlyPreparedCorrections get corrections;

  @BuiltValueField(wireName: r'report')
  MonthlyPreparedReportDetails? get report;

  MonthlyReputationReportResponsePreparation._();

  factory MonthlyReputationReportResponsePreparation([void updates(MonthlyReputationReportResponsePreparationBuilder b)]) = _$MonthlyReputationReportResponsePreparation;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(MonthlyReputationReportResponsePreparationBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<MonthlyReputationReportResponsePreparation> get serializer => _$MonthlyReputationReportResponsePreparationSerializer();
}

class _$MonthlyReputationReportResponsePreparationSerializer implements PrimitiveSerializer<MonthlyReputationReportResponsePreparation> {
  @override
  final Iterable<Type> types = const [MonthlyReputationReportResponsePreparation, _$MonthlyReputationReportResponsePreparation];

  @override
  final String wireName = r'MonthlyReputationReportResponsePreparation';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    MonthlyReputationReportResponsePreparation object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    yield r'responseVersion';
    yield serializers.serialize(
      object.responseVersion,
      specifiedType: const FullType(MonthlyReputationReportResponsePreparationResponseVersionEnum),
    );
    yield r'policyVersion';
    yield serializers.serialize(
      object.policyVersion,
      specifiedType: const FullType(MonthlyReputationReportResponsePreparationPolicyVersionEnum),
    );
    yield r'catalogueHash';
    yield serializers.serialize(
      object.catalogueHash,
      specifiedType: const FullType(String),
    );
    yield r'dataVersion';
    yield serializers.serialize(
      object.dataVersion,
      specifiedType: const FullType(int),
    );
    yield r'preparationOnly';
    yield serializers.serialize(
      object.preparationOnly,
      specifiedType: const FullType(bool),
    );
    yield r'runtimeActivationAllowed';
    yield serializers.serialize(
      object.runtimeActivationAllowed,
      specifiedType: const FullType(bool),
    );
    yield r'appliedPoints';
    yield serializers.serialize(
      object.appliedPoints,
      specifiedType: const FullType(int),
    );
    yield r'maximumSourceMonth';
    yield serializers.serialize(
      object.maximumSourceMonth,
      specifiedType: const FullType(int),
    );
    yield r'responseKind';
    yield serializers.serialize(
      object.responseKind,
      specifiedType: const FullType(MonthlyReputationReportResponsePreparationResponseKindEnum),
    );
    yield r'reportState';
    yield serializers.serialize(
      object.reportState,
      specifiedType: const FullType(MonthlyReputationReportResponsePreparationReportStateEnum),
    );
    yield r'reasonCode';
    yield object.reasonCode == null ? null : serializers.serialize(
      object.reasonCode,
      specifiedType: const FullType.nullable(String),
    );
    yield r'sourceMonth';
    yield serializers.serialize(
      object.sourceMonth,
      specifiedType: const FullType(String),
    );
    yield r'effectiveMonth';
    yield serializers.serialize(
      object.effectiveMonth,
      specifiedType: const FullType(String),
    );
    yield r'levelAuthority';
    yield serializers.serialize(
      object.levelAuthority,
      specifiedType: const FullType(MonthlyPreparedLevelAuthority),
    );
    yield r'snapshotProjection';
    yield object.snapshotProjection == null ? null : serializers.serialize(
      object.snapshotProjection,
      specifiedType: const FullType.nullable(MonthlyPreparedSnapshotProjection),
    );
    yield r'corrections';
    yield serializers.serialize(
      object.corrections,
      specifiedType: const FullType(MonthlyPreparedCorrections),
    );
    yield r'report';
    yield object.report == null ? null : serializers.serialize(
      object.report,
      specifiedType: const FullType.nullable(MonthlyPreparedReportDetails),
    );
  }

  @override
  Object serialize(
    Serializers serializers,
    MonthlyReputationReportResponsePreparation object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required MonthlyReputationReportResponsePreparationBuilder result,
    required List<Object?> unhandled,
  }) {
    for (var i = 0; i < serializedList.length; i += 2) {
      final key = serializedList[i] as String;
      final value = serializedList[i + 1];
      switch (key) {
        case r'responseVersion':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(MonthlyReputationReportResponsePreparationResponseVersionEnum),
          ) as MonthlyReputationReportResponsePreparationResponseVersionEnum;
          result.responseVersion = valueDes;
          break;
        case r'policyVersion':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(MonthlyReputationReportResponsePreparationPolicyVersionEnum),
          ) as MonthlyReputationReportResponsePreparationPolicyVersionEnum;
          result.policyVersion = valueDes;
          break;
        case r'catalogueHash':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.catalogueHash = valueDes;
          break;
        case r'dataVersion':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(int),
          ) as int;
          result.dataVersion = valueDes;
          break;
        case r'preparationOnly':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(bool),
          ) as bool;
          result.preparationOnly = valueDes;
          break;
        case r'runtimeActivationAllowed':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(bool),
          ) as bool;
          result.runtimeActivationAllowed = valueDes;
          break;
        case r'appliedPoints':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(int),
          ) as int;
          result.appliedPoints = valueDes;
          break;
        case r'maximumSourceMonth':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(int),
          ) as int;
          result.maximumSourceMonth = valueDes;
          break;
        case r'responseKind':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(MonthlyReputationReportResponsePreparationResponseKindEnum),
          ) as MonthlyReputationReportResponsePreparationResponseKindEnum;
          result.responseKind = valueDes;
          break;
        case r'reportState':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(MonthlyReputationReportResponsePreparationReportStateEnum),
          ) as MonthlyReputationReportResponsePreparationReportStateEnum;
          result.reportState = valueDes;
          break;
        case r'reasonCode':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType.nullable(String),
          ) as String?;
          if (valueDes == null) continue;
          result.reasonCode = valueDes;
          break;
        case r'sourceMonth':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.sourceMonth = valueDes;
          break;
        case r'effectiveMonth':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.effectiveMonth = valueDes;
          break;
        case r'levelAuthority':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(MonthlyPreparedLevelAuthority),
          ) as MonthlyPreparedLevelAuthority;
          result.levelAuthority.replace(valueDes);
          break;
        case r'snapshotProjection':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType.nullable(MonthlyPreparedSnapshotProjection),
          ) as MonthlyPreparedSnapshotProjection?;
          if (valueDes == null) continue;
          result.snapshotProjection.replace(valueDes);
          break;
        case r'corrections':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(MonthlyPreparedCorrections),
          ) as MonthlyPreparedCorrections;
          result.corrections.replace(valueDes);
          break;
        case r'report':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType.nullable(MonthlyPreparedReportDetails),
          ) as MonthlyPreparedReportDetails?;
          if (valueDes == null) continue;
          result.report.replace(valueDes);
          break;
        default:
          unhandled.add(key);
          unhandled.add(value);
          break;
      }
    }
  }

  @override
  MonthlyReputationReportResponsePreparation deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = MonthlyReputationReportResponsePreparationBuilder();
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

class MonthlyReputationReportResponsePreparationResponseVersionEnum extends EnumClass {

  @BuiltValueEnumConst(wireName: r'monthly-rewards-response-v2-preparation')
  static const MonthlyReputationReportResponsePreparationResponseVersionEnum monthlyRewardsResponseV2Preparation = _$monthlyReputationReportResponsePreparationResponseVersionEnum_monthlyRewardsResponseV2Preparation;

  static Serializer<MonthlyReputationReportResponsePreparationResponseVersionEnum> get serializer => _$monthlyReputationReportResponsePreparationResponseVersionEnumSerializer;

  const MonthlyReputationReportResponsePreparationResponseVersionEnum._(String name): super(name);

  static BuiltSet<MonthlyReputationReportResponsePreparationResponseVersionEnum> get values => _$monthlyReputationReportResponsePreparationResponseVersionEnumValues;
  static MonthlyReputationReportResponsePreparationResponseVersionEnum valueOf(String name) => _$monthlyReputationReportResponsePreparationResponseVersionEnumValueOf(name);
}

class MonthlyReputationReportResponsePreparationPolicyVersionEnum extends EnumClass {

  @BuiltValueEnumConst(wireName: r'lythaus-monthly-rewards-2026-10-v2')
  static const MonthlyReputationReportResponsePreparationPolicyVersionEnum lythausMonthlyRewards202610V2 = _$monthlyReputationReportResponsePreparationPolicyVersionEnum_lythausMonthlyRewards202610V2;

  static Serializer<MonthlyReputationReportResponsePreparationPolicyVersionEnum> get serializer => _$monthlyReputationReportResponsePreparationPolicyVersionEnumSerializer;

  const MonthlyReputationReportResponsePreparationPolicyVersionEnum._(String name): super(name);

  static BuiltSet<MonthlyReputationReportResponsePreparationPolicyVersionEnum> get values => _$monthlyReputationReportResponsePreparationPolicyVersionEnumValues;
  static MonthlyReputationReportResponsePreparationPolicyVersionEnum valueOf(String name) => _$monthlyReputationReportResponsePreparationPolicyVersionEnumValueOf(name);
}

class MonthlyReputationReportResponsePreparationResponseKindEnum extends EnumClass {

  @BuiltValueEnumConst(wireName: r'monthly_reputation_report')
  static const MonthlyReputationReportResponsePreparationResponseKindEnum monthlyReputationReport = _$monthlyReputationReportResponsePreparationResponseKindEnum_monthlyReputationReport;

  static Serializer<MonthlyReputationReportResponsePreparationResponseKindEnum> get serializer => _$monthlyReputationReportResponsePreparationResponseKindEnumSerializer;

  const MonthlyReputationReportResponsePreparationResponseKindEnum._(String name): super(name);

  static BuiltSet<MonthlyReputationReportResponsePreparationResponseKindEnum> get values => _$monthlyReputationReportResponsePreparationResponseKindEnumValues;
  static MonthlyReputationReportResponsePreparationResponseKindEnum valueOf(String name) => _$monthlyReputationReportResponsePreparationResponseKindEnumValueOf(name);
}

class MonthlyReputationReportResponsePreparationReportStateEnum extends EnumClass {

  @BuiltValueEnumConst(wireName: r'pending')
  static const MonthlyReputationReportResponsePreparationReportStateEnum pending = _$monthlyReputationReportResponsePreparationReportStateEnum_pending;
  @BuiltValueEnumConst(wireName: r'shadow')
  static const MonthlyReputationReportResponsePreparationReportStateEnum shadow = _$monthlyReputationReportResponsePreparationReportStateEnum_shadow;

  static Serializer<MonthlyReputationReportResponsePreparationReportStateEnum> get serializer => _$monthlyReputationReportResponsePreparationReportStateEnumSerializer;

  const MonthlyReputationReportResponsePreparationReportStateEnum._(String name): super(name);

  static BuiltSet<MonthlyReputationReportResponsePreparationReportStateEnum> get values => _$monthlyReputationReportResponsePreparationReportStateEnumValues;
  static MonthlyReputationReportResponsePreparationReportStateEnum valueOf(String name) => _$monthlyReputationReportResponsePreparationReportStateEnumValueOf(name);
}
