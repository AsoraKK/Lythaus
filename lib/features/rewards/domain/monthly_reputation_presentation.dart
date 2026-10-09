// ignore_for_file: public_member_api_docs

import 'package:intl/intl.dart';
import 'package:lythaus_api_client/lythaus_api_client.dart' as api;

const historicalMonthlyPolicy = 'lythaus-monthly-rewards-2026-10-v1';

Map<String, Object?> monthlyReportDetail(
  api.MonthlyReputationReportResponse response,
) => response.policyVersion == historicalMonthlyPolicy
    ? response.report?.toMap().map(
            (key, value) => MapEntry(key, value?.value),
          ) ??
          const {}
    : const {};

Map<String, Object?> evidenceObject(Object? value) =>
    value is Map<Object?, Object?>
    ? value.map((key, value) => MapEntry(key.toString(), value))
    : const {};
List<Map<String, Object?>> evidenceList(Object? value) => value is List
    ? value.whereType<Map<Object?, Object?>>().map(evidenceObject).toList()
    : const [];
String? evidenceText(Object? value) =>
    value is String && value.trim().isNotEmpty ? value : null;
int? evidenceInteger(Object? value) =>
    value is num &&
        value.isFinite &&
        value >= 0 &&
        value <= 9007199254740991 &&
        value % 1 == 0
    ? value.toInt()
    : null;
String evidencePoints(Object? value) {
  final points = evidenceInteger(value);
  return points == null
      ? 'Unknown'
      : NumberFormat.decimalPattern().format(points);
}

String evidenceDate(Object? value) {
  final text = evidenceText(value);
  final date = text == null ? null : DateTime.tryParse(text);
  return date == null
      ? 'Unknown date'
      : '${DateFormat.yMMMd().format(date.toUtc())} UTC';
}

String evidenceMonth(String? month) {
  if (month == null || !RegExp(r'^\d{4}-(0[1-9]|1[0-2])$').hasMatch(month)) {
    return 'Unknown month';
  }
  return DateFormat.yMMMM().format(DateTime.parse('$month-01'));
}

bool hasDisabledMethodology(
  api.MonthlyResponsePreparationReadiness? readiness,
) =>
    readiness != null &&
    readiness.state ==
        api.MonthlyResponsePreparationReadinessStateEnum.disabled &&
    readiness.responseVersion == 'monthly-rewards-response-v2-preparation' &&
    readiness.policyVersion == 'lythaus-monthly-rewards-2026-10-v2' &&
    readiness.dataVersion == 2 &&
    readiness.maximumSourceMonth == 13650 &&
    readiness.catalogueHash ==
        '26213abccce99ee51be6c0623406c28aaa7d39ed3ea3b4ac630b7cffd859db67' &&
    readiness.preparationOnly &&
    !readiness.runtimeActivationAllowed &&
    readiness.appliedPoints == 0;
