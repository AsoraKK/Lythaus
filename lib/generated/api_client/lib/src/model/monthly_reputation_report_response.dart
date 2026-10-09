//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:lythaus_api_client/src/model/monthly_reputation_report_response_preparation.dart';
import 'package:lythaus_api_client/src/model/monthly_response_preparation_readiness.dart';
import 'package:built_collection/built_collection.dart';
import 'package:lythaus_api_client/src/model/monthly_reputation_report_response_corrections.dart';
import 'package:lythaus_api_client/src/model/monthly_reputation_report_response_level_authority.dart';
import 'package:built_value/json_object.dart';
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'monthly_reputation_report_response.g.dart';

/// MonthlyReputationReportResponse
///
/// Properties:
/// * [reportState]
/// * [reasonCode]
/// * [sourceMonth]
/// * [effectiveMonth]
/// * [policyVersion]
/// * [levelAuthority]
/// * [corrections]
/// * [report]
/// * [responsePreparation]
/// * [preparedResponse]
@BuiltValue()
abstract class MonthlyReputationReportResponse implements Built<MonthlyReputationReportResponse, MonthlyReputationReportResponseBuilder> {
  @BuiltValueField(wireName: r'reportState')
  MonthlyReputationReportResponseReportStateEnum get reportState;
  // enum reportStateEnum {  pending,  shadow,  };

  @BuiltValueField(wireName: r'reasonCode')
  String? get reasonCode;

  @BuiltValueField(wireName: r'sourceMonth')
  String get sourceMonth;

  @BuiltValueField(wireName: r'effectiveMonth')
  String get effectiveMonth;

  @BuiltValueField(wireName: r'policyVersion')
  String get policyVersion;

  @BuiltValueField(wireName: r'levelAuthority')
  MonthlyReputationReportResponseLevelAuthority get levelAuthority;

  @BuiltValueField(wireName: r'corrections')
  MonthlyReputationReportResponseCorrections get corrections;

  @BuiltValueField(wireName: r'report')
  BuiltMap<String, JsonObject?>? get report;

  @BuiltValueField(wireName: r'responsePreparation')
  MonthlyResponsePreparationReadiness? get responsePreparation;

  @BuiltValueField(wireName: r'preparedResponse')
  MonthlyReputationReportResponsePreparation? get preparedResponse;

  MonthlyReputationReportResponse._();

  factory MonthlyReputationReportResponse([void updates(MonthlyReputationReportResponseBuilder b)]) = _$MonthlyReputationReportResponse;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(MonthlyReputationReportResponseBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<MonthlyReputationReportResponse> get serializer => _$MonthlyReputationReportResponseSerializer();
}

class _$MonthlyReputationReportResponseSerializer implements PrimitiveSerializer<MonthlyReputationReportResponse> {
  @override
  final Iterable<Type> types = const [MonthlyReputationReportResponse, _$MonthlyReputationReportResponse];

  @override
  final String wireName = r'MonthlyReputationReportResponse';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    MonthlyReputationReportResponse object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    yield r'reportState';
    yield serializers.serialize(
      object.reportState,
      specifiedType: const FullType(MonthlyReputationReportResponseReportStateEnum),
    );
    if (object.reasonCode != null) {
      yield r'reasonCode';
      yield serializers.serialize(
        object.reasonCode,
        specifiedType: const FullType.nullable(String),
      );
    }
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
    yield r'policyVersion';
    yield serializers.serialize(
      object.policyVersion,
      specifiedType: const FullType(String),
    );
    yield r'levelAuthority';
    yield serializers.serialize(
      object.levelAuthority,
      specifiedType: const FullType(MonthlyReputationReportResponseLevelAuthority),
    );
    yield r'corrections';
    yield serializers.serialize(
      object.corrections,
      specifiedType: const FullType(MonthlyReputationReportResponseCorrections),
    );
    yield r'report';
    yield object.report == null ? null : serializers.serialize(
      object.report,
      specifiedType: const FullType.nullable(BuiltMap, [FullType(String), FullType.nullable(JsonObject)]),
    );
    if (object.responsePreparation != null) {
      yield r'responsePreparation';
      yield serializers.serialize(
        object.responsePreparation,
        specifiedType: const FullType.nullable(MonthlyResponsePreparationReadiness),
      );
    }
    if (object.preparedResponse != null) {
      yield r'preparedResponse';
      yield serializers.serialize(
        object.preparedResponse,
        specifiedType: const FullType.nullable(MonthlyReputationReportResponsePreparation),
      );
    }
  }

  @override
  Object serialize(
    Serializers serializers,
    MonthlyReputationReportResponse object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required MonthlyReputationReportResponseBuilder result,
    required List<Object?> unhandled,
  }) {
    for (var i = 0; i < serializedList.length; i += 2) {
      final key = serializedList[i] as String;
      final value = serializedList[i + 1];
      switch (key) {
        case r'reportState':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(MonthlyReputationReportResponseReportStateEnum),
          ) as MonthlyReputationReportResponseReportStateEnum;
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
        case r'policyVersion':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.policyVersion = valueDes;
          break;
        case r'levelAuthority':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(MonthlyReputationReportResponseLevelAuthority),
          ) as MonthlyReputationReportResponseLevelAuthority;
          result.levelAuthority.replace(valueDes);
          break;
        case r'corrections':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(MonthlyReputationReportResponseCorrections),
          ) as MonthlyReputationReportResponseCorrections;
          result.corrections.replace(valueDes);
          break;
        case r'report':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType.nullable(BuiltMap, [FullType(String), FullType.nullable(JsonObject)]),
          ) as BuiltMap<String, JsonObject?>?;
          if (valueDes == null) continue;
          result.report.replace(valueDes);
          break;
        case r'responsePreparation':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType.nullable(MonthlyResponsePreparationReadiness),
          ) as MonthlyResponsePreparationReadiness?;
          if (valueDes == null) continue;
          result.responsePreparation.replace(valueDes);
          break;
        case r'preparedResponse':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType.nullable(MonthlyReputationReportResponsePreparation),
          ) as MonthlyReputationReportResponsePreparation?;
          if (valueDes == null) continue;
          result.preparedResponse.replace(valueDes);
          break;
        default:
          unhandled.add(key);
          unhandled.add(value);
          break;
      }
    }
  }

  @override
  MonthlyReputationReportResponse deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = MonthlyReputationReportResponseBuilder();
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

class MonthlyReputationReportResponseReportStateEnum extends EnumClass {

  @BuiltValueEnumConst(wireName: r'pending')
  static const MonthlyReputationReportResponseReportStateEnum pending = _$monthlyReputationReportResponseReportStateEnum_pending;
  @BuiltValueEnumConst(wireName: r'shadow')
  static const MonthlyReputationReportResponseReportStateEnum shadow = _$monthlyReputationReportResponseReportStateEnum_shadow;

  static Serializer<MonthlyReputationReportResponseReportStateEnum> get serializer => _$monthlyReputationReportResponseReportStateEnumSerializer;

  const MonthlyReputationReportResponseReportStateEnum._(String name): super(name);

  static BuiltSet<MonthlyReputationReportResponseReportStateEnum> get values => _$monthlyReputationReportResponseReportStateEnumValues;
  static MonthlyReputationReportResponseReportStateEnum valueOf(String name) => _$monthlyReputationReportResponseReportStateEnumValueOf(name);
}
