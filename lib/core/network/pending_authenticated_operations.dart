// ignore_for_file: public_member_api_docs

import 'dart:async';

import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/scheduler.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

final pendingAuthenticatedOperationsProvider =
    ChangeNotifierProvider<PendingAuthenticatedOperations>(
      (_) => PendingAuthenticatedOperations(),
    );

class PendingAuthenticatedOperations extends ChangeNotifier {
  static const _requestTokenKey = 'lythaus.pending_operation_token';

  final _activeOperations = <Object>{};
  bool _disposed = false;
  bool _notificationScheduled = false;

  int get activeCount => _activeOperations.length;
  bool get hasPending => _activeOperations.isNotEmpty;

  void _changed() {
    if (_disposed || _notificationScheduled) return;
    _notificationScheduled = true;
    scheduleMicrotask(() {
      if (_disposed) {
        _notificationScheduled = false;
        return;
      }
      if (BindingBase.debugBindingType() != null &&
          SchedulerBinding.instance.schedulerPhase ==
              SchedulerPhase.persistentCallbacks) {
        SchedulerBinding.instance.addPostFrameCallback((_) {
          _notificationScheduled = false;
          if (!_disposed) notifyListeners();
        });
        return;
      }
      _notificationScheduled = false;
      notifyListeners();
    });
  }

  Object beginOperation() {
    final token = Object();
    _activeOperations.add(token);
    _changed();
    return token;
  }

  void finishOperation(Object token) {
    if (_activeOperations.remove(token)) _changed();
  }

  void trackRequest(RequestOptions options) {
    if (!_isWrite(options.method) ||
        options.extra.containsKey(_requestTokenKey)) {
      return;
    }
    options.extra[_requestTokenKey] = beginOperation();
  }

  void completeRequest(RequestOptions options) {
    final token = options.extra.remove(_requestTokenKey);
    if (token is Object) finishOperation(token);
  }

  static bool _isWrite(String method) =>
      const {'POST', 'PUT', 'PATCH', 'DELETE'}.contains(method.toUpperCase());

  @override
  void dispose() {
    _disposed = true;
    super.dispose();
  }
}

class PendingAuthenticatedOperationInterceptor extends Interceptor {
  PendingAuthenticatedOperationInterceptor(this._operations);

  final PendingAuthenticatedOperations _operations;

  @override
  void onRequest(RequestOptions options, RequestInterceptorHandler handler) {
    _operations.trackRequest(options);
    handler.next(options);
  }

  @override
  void onResponse(
    Response<dynamic> response,
    ResponseInterceptorHandler handler,
  ) {
    _operations.completeRequest(response.requestOptions);
    handler.next(response);
  }

  @override
  void onError(DioException err, ErrorInterceptorHandler handler) {
    _operations.completeRequest(err.requestOptions);
    handler.next(err);
  }
}
