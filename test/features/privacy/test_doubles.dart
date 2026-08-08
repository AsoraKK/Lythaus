import 'package:lythaus/features/privacy/services/privacy_api.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

class TestPrivacyApi implements PrivacyApi {
  @override
  Future<void> deleteAccount({
    required String authToken,
    required bool hardDelete,
  }) async {}

  @override
  Future<ExportStatusDTO> getExportStatus({required String authToken}) async {
    return const ExportStatusDTO(state: 'idle');
  }

  @override
  Future<ExportRequestResult> requestExport({required String authToken}) async {
    return ExportRequestResult(
      requestId: 'request-1',
      acceptedAt: DateTime.now().toUtc(),
    );
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
