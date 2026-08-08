import 'package:lythaus/features/notifications/application/notification_permission_service.dart';
import 'package:lythaus/features/notifications/domain/notification_models.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:permission_handler_platform_interface/permission_handler_platform_interface.dart';

class _FakePermissionHandlerPlatform extends PermissionHandlerPlatform {
  PermissionStatus status = PermissionStatus.denied;
  PermissionStatus requestStatus = PermissionStatus.denied;
  bool openSettingsCalled = false;

  @override
  Future<PermissionStatus> checkPermissionStatus(Permission permission) async {
    return status;
  }

  @override
  Future<Map<Permission, PermissionStatus>> requestPermissions(
    List<Permission> permissions,
  ) async {
    return {for (final permission in permissions) permission: requestStatus};
  }

  @override
  Future<bool> openAppSettings() async {
    openSettingsCalled = true;
    return true;
  }

  @override
  Future<ServiceStatus> checkServiceStatus(Permission permission) async {
    return ServiceStatus.enabled;
  }

  @override
  Future<bool> shouldShowRequestPermissionRationale(
    Permission permission,
  ) async {
    return false;
  }
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  late PermissionHandlerPlatform originalPlatform;
  late _FakePermissionHandlerPlatform fakePlatform;
  late NotificationPermissionService service;

  setUp(() {
    originalPlatform = PermissionHandlerPlatform.instance;
    fakePlatform = _FakePermissionHandlerPlatform();
    PermissionHandlerPlatform.instance = fakePlatform;
    service = NotificationPermissionService();
  });

  tearDown(() {
    PermissionHandlerPlatform.instance = originalPlatform;
  });

  test('checkPermissionStatus maps granted to authorized', () async {
    fakePlatform.status = PermissionStatus.granted;
    final status = await service.checkPermissionStatus();
    expect(status, NotificationPermissionStatus.authorized);
  });

  test('checkPermissionStatus maps denied to denied', () async {
    fakePlatform.status = PermissionStatus.denied;
    final status = await service.checkPermissionStatus();
    expect(status, NotificationPermissionStatus.denied);
  });

  test('checkPermissionStatus maps restricted to restricted', () async {
    fakePlatform.status = PermissionStatus.restricted;
    final status = await service.checkPermissionStatus();
    expect(status, NotificationPermissionStatus.restricted);
  });

  test('checkPermissionStatus maps limited to provisional', () async {
    fakePlatform.status = PermissionStatus.limited;
    final status = await service.checkPermissionStatus();
    expect(status, NotificationPermissionStatus.provisional);
  });

  test('checkPermissionStatus maps provisional to provisional', () async {
    fakePlatform.status = PermissionStatus.provisional;
    final status = await service.checkPermissionStatus();
    expect(status, NotificationPermissionStatus.provisional);
  });

  test('checkPermissionStatus maps permanentlyDenied to denied', () async {
    fakePlatform.status = PermissionStatus.permanentlyDenied;
    final status = await service.checkPermissionStatus();
    expect(status, NotificationPermissionStatus.denied);
  });

  test('requestPermission maps granted to authorized', () async {
    fakePlatform.requestStatus = PermissionStatus.granted;
    final status = await service.requestPermission();
    expect(status, NotificationPermissionStatus.authorized);
  });

  test('requestPermission maps limited to provisional', () async {
    fakePlatform.requestStatus = PermissionStatus.limited;
    final status = await service.requestPermission();
    expect(status, NotificationPermissionStatus.provisional);
  });

  test('requestPermission maps denied to denied', () async {
    fakePlatform.requestStatus = PermissionStatus.denied;
    final status = await service.requestPermission();
    expect(status, NotificationPermissionStatus.denied);
  });

  test('shouldShowPrePrompt returns true for denied', () async {
    fakePlatform.status = PermissionStatus.denied;
    final result = await service.shouldShowPrePrompt();
    expect(result, isTrue);
  });

  test('shouldShowPrePrompt returns false for authorized', () async {
    fakePlatform.status = PermissionStatus.granted;
    final result = await service.shouldShowPrePrompt();
    expect(result, isFalse);
  });

  test('shouldShowPrePrompt returns false for restricted', () async {
    fakePlatform.status = PermissionStatus.restricted;
    final result = await service.shouldShowPrePrompt();
    expect(result, isFalse);
  });
}
