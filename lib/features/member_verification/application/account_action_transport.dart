import 'package:dio/dio.dart';

/// Native requests retain the existing secure adapter and interceptors.
Dio accountActionTransport(Dio existing) => existing;
