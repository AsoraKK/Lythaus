// ignore_for_file: public_member_api_docs

import 'package:meta/meta.dart';

enum ExportStatus {
  idle,
  requesting,
  queued,
  accepted,
  coolingDown,
  received,
  processing,
  blocked,
  completed,
  failed,
  unknown,
}

enum DeleteStatus {
  idle,
  confirming,
  deleting,
  requested,
  processing,
  blocked,
  completed,
  failed,
  unknown,
}

@immutable
class PrivacyState {
  const PrivacyState({
    this.exportStatus = ExportStatus.unknown,
    this.deleteStatus = DeleteStatus.unknown,
    this.lastExportAt,
    this.remainingCooldown = Duration.zero,
    this.error,
    this.requestId,
    this.completedAt,
    this.deleteRequestId,
    this.exportAllowed = false,
    this.deleteAllowed = false,
    this.cooldownKnown = false,
    this.refreshing = false,
    this.downloading = false,
    this.isGuest = false,
  });

  final ExportStatus exportStatus;
  final DeleteStatus deleteStatus;
  final DateTime? lastExportAt;
  final Duration remainingCooldown;
  final String? error;
  final String? requestId;
  final DateTime? completedAt;
  final String? deleteRequestId;
  final bool exportAllowed;
  final bool deleteAllowed;
  final bool cooldownKnown;
  final bool refreshing;
  final bool downloading;
  final bool isGuest;

  bool get canRequestExport =>
      !isGuest &&
      exportAllowed &&
      !refreshing &&
      !downloading &&
      deleteStatus != DeleteStatus.deleting &&
      remainingCooldown <= Duration.zero &&
      (exportStatus == ExportStatus.idle ||
          exportStatus == ExportStatus.failed ||
          exportStatus == ExportStatus.completed);
  bool get canRequestDeletion =>
      !isGuest &&
      deleteAllowed &&
      !refreshing &&
      !downloading &&
      exportStatus != ExportStatus.requesting &&
      deleteStatus != DeleteStatus.deleting;
  bool get canDownload =>
      !isGuest &&
      exportStatus == ExportStatus.completed &&
      requestId != null &&
      !downloading &&
      !refreshing &&
      deleteStatus != DeleteStatus.deleting;
  bool get isCoolingDown => remainingCooldown > Duration.zero;
  bool get hasLastExport => lastExportAt != null;

  PrivacyState copyWith({
    ExportStatus? exportStatus,
    DeleteStatus? deleteStatus,
    DateTime? lastExportAt,
    Duration? remainingCooldown,
    String? error,
    bool clearError = false,
    String? requestId,
    DateTime? completedAt,
    String? deleteRequestId,
    bool clearExport = false,
    bool clearDeletion = false,
    bool? exportAllowed,
    bool? deleteAllowed,
    bool? cooldownKnown,
    bool? refreshing,
    bool? downloading,
    bool? isGuest,
  }) => PrivacyState(
    exportStatus: exportStatus ?? this.exportStatus,
    deleteStatus: deleteStatus ?? this.deleteStatus,
    lastExportAt: clearExport ? null : lastExportAt ?? this.lastExportAt,
    remainingCooldown: remainingCooldown ?? this.remainingCooldown,
    error: clearError ? null : error ?? this.error,
    requestId: clearExport ? null : requestId ?? this.requestId,
    completedAt: clearExport ? null : completedAt ?? this.completedAt,
    deleteRequestId: clearDeletion
        ? null
        : deleteRequestId ?? this.deleteRequestId,
    exportAllowed: exportAllowed ?? this.exportAllowed,
    deleteAllowed: deleteAllowed ?? this.deleteAllowed,
    cooldownKnown: cooldownKnown ?? this.cooldownKnown,
    refreshing: refreshing ?? this.refreshing,
    downloading: downloading ?? this.downloading,
    isGuest: isGuest ?? this.isGuest,
  );
}
