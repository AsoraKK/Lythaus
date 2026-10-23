import 'package:dio/dio.dart';

/// Native requests retain the existing secure adapter and interceptors.
Dio accountActionTransport(Dio existing) => existing;

/// The native adapter is shared and remains owned by secureDioProvider.
void disposeAccountActionTransport(Dio dio) {}
