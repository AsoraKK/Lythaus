import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lythaus/core/network/pending_authenticated_operations.dart';

void main() {
  test('tracks write requests until their response is complete', () {
    final operations = PendingAuthenticatedOperations();
    final options = RequestOptions(path: '/api/comments', method: 'POST');

    operations.trackRequest(options);
    operations.trackRequest(options);
    expect(operations.activeCount, 1);
    expect(operations.hasPending, isTrue);

    operations.completeRequest(options);
    operations.completeRequest(options);
    expect(operations.activeCount, 0);
    expect(operations.hasPending, isFalse);
  });

  test('does not block reload for read requests', () {
    final operations = PendingAuthenticatedOperations();
    final options = RequestOptions(path: '/api/feed', method: 'GET');

    operations.trackRequest(options);
    expect(operations.hasPending, isFalse);
    operations.completeRequest(options);
    expect(operations.hasPending, isFalse);
  });

  test('tracks auth state transitions independently of HTTP requests', () {
    final operations = PendingAuthenticatedOperations();
    final first = operations.beginOperation();
    final second = operations.beginOperation();

    expect(operations.activeCount, 2);
    operations.finishOperation(first);
    expect(operations.activeCount, 1);
    operations.finishOperation(second);
    expect(operations.hasPending, isFalse);
  });
}
