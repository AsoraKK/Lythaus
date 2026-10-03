import 'package:lythaus/features/privacy/services/privacy_api.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'dart:typed_data';

class TestPrivacyApi implements PrivacyApi {
  ExportStatusDTO status = const ExportStatusDTO(
    state: 'idle',
    canRequest: true,
  );
  ExportStatusDTO deletion = const ExportStatusDTO(
    state: 'idle',
    canRequest: true,
  );
  Future<ExportStatusDTO> Function()? onStatus;
  Future<ExportStatusDTO> Function()? onDeletionStatus;
  Future<ExportRequestResult> Function()? onExport;
  Future<ExportStatusDTO> Function()? onDelete;
  Future<Uint8List> Function()? onDownload;
  int exportCalls = 0;
  int deleteCalls = 0;
  int statusCalls = 0;
  int downloadCalls = 0;

  @override
  Future<ExportStatusDTO> deleteAccount({required String authToken}) async {
    deleteCalls++;
    return onDelete == null
        ? ExportStatusDTO(
            state: 'received',
            requestId: 'delete-1',
            acceptedAt: DateTime.utc(2026, 10, 2),
          )
        : await onDelete!();
  }

  @override
  Future<ExportStatusDTO> getDeleteStatus({required String authToken}) async =>
      onDeletionStatus == null ? deletion : await onDeletionStatus!();

  @override
  Future<ExportStatusDTO> getExportStatus({required String authToken}) async {
    statusCalls++;
    return onStatus == null ? status : await onStatus!();
  }

  @override
  Future<ExportRequestResult> requestExport({required String authToken}) async {
    exportCalls++;
    if (onExport != null) return await onExport!();
    return ExportRequestResult(
      requestId: 'request-1',
      acceptedAt: DateTime.now().toUtc(),
    );
  }

  @override
  Future<Uint8List> downloadExport({
    required String authToken,
    required String requestId,
  }) async {
    downloadCalls++;
    return onDownload == null
        ? Uint8List.fromList([123, 125])
        : await onDownload!();
  }
}

class NullSecureStorage implements FlutterSecureStorage {
  @override
  Future<void> write({
    required String key,
    required String? value,
    IOSOptions? iOptions,
    AndroidOptions? aOptions,
    LinuxOptions? lOptions,
    WebOptions? webOptions,
    MacOsOptions? mOptions,
    WindowsOptions? wOptions,
  }) async {}

  @override
  Future<String?> read({
    required String key,
    IOSOptions? iOptions,
    AndroidOptions? aOptions,
    LinuxOptions? lOptions,
    WebOptions? webOptions,
    MacOsOptions? mOptions,
    WindowsOptions? wOptions,
  }) async => null;

  @override
  Future<void> delete({
    required String key,
    IOSOptions? iOptions,
    AndroidOptions? aOptions,
    LinuxOptions? lOptions,
    WebOptions? webOptions,
    MacOsOptions? mOptions,
    WindowsOptions? wOptions,
  }) async {}

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

class MemoryPrivacyStorage extends NullSecureStorage {
  final values = <String, String?>{};
  bool failWrites = false;
  bool failReads = false;

  @override
  Future<String?> read({
    required String key,
    IOSOptions? iOptions,
    AndroidOptions? aOptions,
    LinuxOptions? lOptions,
    WebOptions? webOptions,
    MacOsOptions? mOptions,
    WindowsOptions? wOptions,
  }) async {
    if (failReads) throw StateError('synthetic storage failure');
    return values[key];
  }

  @override
  Future<void> write({
    required String key,
    required String? value,
    IOSOptions? iOptions,
    AndroidOptions? aOptions,
    LinuxOptions? lOptions,
    WebOptions? webOptions,
    MacOsOptions? mOptions,
    WindowsOptions? wOptions,
  }) async {
    if (failWrites) throw StateError('synthetic storage failure');
    values[key] = value;
  }

  @override
  Future<void> delete({
    required String key,
    IOSOptions? iOptions,
    AndroidOptions? aOptions,
    LinuxOptions? lOptions,
    WebOptions? webOptions,
    MacOsOptions? mOptions,
    WindowsOptions? wOptions,
  }) async => values.remove(key);
}
