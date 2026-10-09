//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:lythaus_api_client/src/model/monthly_prepared_quarterly_total.dart';
import 'package:lythaus_api_client/src/model/monthly_prepared_report_total.dart';
import 'package:lythaus_api_client/src/model/monthly_prepared_email_qualification.dart';
import 'package:lythaus_api_client/src/model/monthly_prepared_suggestion_qualification.dart';
import 'package:lythaus_api_client/src/model/monthly_prepared_weekly_progress.dart';
import 'package:lythaus_api_client/src/model/monthly_prepared_monthly_progress.dart';
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'monthly_prepared_report_details.g.dart';

/// MonthlyPreparedReportDetails
///
/// Properties:
/// * [sourceRevision]
/// * [sourceReasonCode]
/// * [sourceRecordedAt]
/// * [assessmentMode]
/// * [sourceDigest]
/// * [assemblyEvidenceDigest]
/// * [weekly]
/// * [monthly]
/// * [quarterlyEmail]
/// * [quarterlySuggestion]
/// * [quarterlyTotal]
/// * [total]
@BuiltValue()
abstract class MonthlyPreparedReportDetails implements Built<MonthlyPreparedReportDetails, MonthlyPreparedReportDetailsBuilder> {
  @BuiltValueField(wireName: r'sourceRevision')
  int get sourceRevision;

  @BuiltValueField(wireName: r'sourceReasonCode')
  String? get sourceReasonCode;

  @BuiltValueField(wireName: r'sourceRecordedAt')
  DateTime? get sourceRecordedAt;

  @BuiltValueField(wireName: r'assessmentMode')
  String? get assessmentMode;

  @BuiltValueField(wireName: r'sourceDigest')
  String get sourceDigest;

  @BuiltValueField(wireName: r'assemblyEvidenceDigest')
  String get assemblyEvidenceDigest;

  @BuiltValueField(wireName: r'weekly')
  MonthlyPreparedWeeklyProgress? get weekly;

  @BuiltValueField(wireName: r'monthly')
  MonthlyPreparedMonthlyProgress get monthly;

  @BuiltValueField(wireName: r'quarterlyEmail')
  MonthlyPreparedEmailQualification? get quarterlyEmail;

  @BuiltValueField(wireName: r'quarterlySuggestion')
  MonthlyPreparedSuggestionQualification? get quarterlySuggestion;

  @BuiltValueField(wireName: r'quarterlyTotal')
  MonthlyPreparedQuarterlyTotal get quarterlyTotal;

  @BuiltValueField(wireName: r'total')
  MonthlyPreparedReportTotal? get total;

  MonthlyPreparedReportDetails._();

  factory MonthlyPreparedReportDetails([void updates(MonthlyPreparedReportDetailsBuilder b)]) = _$MonthlyPreparedReportDetails;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(MonthlyPreparedReportDetailsBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<MonthlyPreparedReportDetails> get serializer => _$MonthlyPreparedReportDetailsSerializer();
}

class _$MonthlyPreparedReportDetailsSerializer implements PrimitiveSerializer<MonthlyPreparedReportDetails> {
  @override
  final Iterable<Type> types = const [MonthlyPreparedReportDetails, _$MonthlyPreparedReportDetails];

  @override
  final String wireName = r'MonthlyPreparedReportDetails';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    MonthlyPreparedReportDetails object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    yield r'sourceRevision';
    yield serializers.serialize(
      object.sourceRevision,
      specifiedType: const FullType(int),
    );
    yield r'sourceReasonCode';
    yield object.sourceReasonCode == null ? null : serializers.serialize(
      object.sourceReasonCode,
      specifiedType: const FullType.nullable(String),
    );
    yield r'sourceRecordedAt';
    yield object.sourceRecordedAt == null ? null : serializers.serialize(
      object.sourceRecordedAt,
      specifiedType: const FullType.nullable(DateTime),
    );
    yield r'assessmentMode';
    yield object.assessmentMode == null ? null : serializers.serialize(
      object.assessmentMode,
      specifiedType: const FullType.nullable(String),
    );
    yield r'sourceDigest';
    yield serializers.serialize(
      object.sourceDigest,
      specifiedType: const FullType(String),
    );
    yield r'assemblyEvidenceDigest';
    yield serializers.serialize(
      object.assemblyEvidenceDigest,
      specifiedType: const FullType(String),
    );
    yield r'weekly';
    yield object.weekly == null ? null : serializers.serialize(
      object.weekly,
      specifiedType: const FullType.nullable(MonthlyPreparedWeeklyProgress),
    );
    yield r'monthly';
    yield serializers.serialize(
      object.monthly,
      specifiedType: const FullType(MonthlyPreparedMonthlyProgress),
    );
    yield r'quarterlyEmail';
    yield object.quarterlyEmail == null ? null : serializers.serialize(
      object.quarterlyEmail,
      specifiedType: const FullType.nullable(MonthlyPreparedEmailQualification),
    );
    yield r'quarterlySuggestion';
    yield object.quarterlySuggestion == null ? null : serializers.serialize(
      object.quarterlySuggestion,
      specifiedType: const FullType.nullable(MonthlyPreparedSuggestionQualification),
    );
    yield r'quarterlyTotal';
    yield serializers.serialize(
      object.quarterlyTotal,
      specifiedType: const FullType(MonthlyPreparedQuarterlyTotal),
    );
    yield r'total';
    yield object.total == null ? null : serializers.serialize(
      object.total,
      specifiedType: const FullType.nullable(MonthlyPreparedReportTotal),
    );
  }

  @override
  Object serialize(
    Serializers serializers,
    MonthlyPreparedReportDetails object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required MonthlyPreparedReportDetailsBuilder result,
    required List<Object?> unhandled,
  }) {
    for (var i = 0; i < serializedList.length; i += 2) {
      final key = serializedList[i] as String;
      final value = serializedList[i + 1];
      switch (key) {
        case r'sourceRevision':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(int),
          ) as int;
          result.sourceRevision = valueDes;
          break;
        case r'sourceReasonCode':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType.nullable(String),
          ) as String?;
          if (valueDes == null) continue;
          result.sourceReasonCode = valueDes;
          break;
        case r'sourceRecordedAt':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType.nullable(DateTime),
          ) as DateTime?;
          if (valueDes == null) continue;
          result.sourceRecordedAt = valueDes;
          break;
        case r'assessmentMode':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType.nullable(String),
          ) as String?;
          if (valueDes == null) continue;
          result.assessmentMode = valueDes;
          break;
        case r'sourceDigest':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.sourceDigest = valueDes;
          break;
        case r'assemblyEvidenceDigest':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.assemblyEvidenceDigest = valueDes;
          break;
        case r'weekly':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType.nullable(MonthlyPreparedWeeklyProgress),
          ) as MonthlyPreparedWeeklyProgress?;
          if (valueDes == null) continue;
          result.weekly.replace(valueDes);
          break;
        case r'monthly':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(MonthlyPreparedMonthlyProgress),
          ) as MonthlyPreparedMonthlyProgress;
          result.monthly.replace(valueDes);
          break;
        case r'quarterlyEmail':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType.nullable(MonthlyPreparedEmailQualification),
          ) as MonthlyPreparedEmailQualification?;
          if (valueDes == null) continue;
          result.quarterlyEmail.replace(valueDes);
          break;
        case r'quarterlySuggestion':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType.nullable(MonthlyPreparedSuggestionQualification),
          ) as MonthlyPreparedSuggestionQualification?;
          if (valueDes == null) continue;
          result.quarterlySuggestion.replace(valueDes);
          break;
        case r'quarterlyTotal':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(MonthlyPreparedQuarterlyTotal),
          ) as MonthlyPreparedQuarterlyTotal;
          result.quarterlyTotal.replace(valueDes);
          break;
        case r'total':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType.nullable(MonthlyPreparedReportTotal),
          ) as MonthlyPreparedReportTotal?;
          if (valueDes == null) continue;
          result.total.replace(valueDes);
          break;
        default:
          unhandled.add(key);
          unhandled.add(value);
          break;
      }
    }
  }

  @override
  MonthlyPreparedReportDetails deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = MonthlyPreparedReportDetailsBuilder();
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
