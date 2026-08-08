import 'dart:convert';

import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:lythaus/core/network/dio_client.dart';
import 'package:lythaus/features/rewards/application/reward_providers.dart';

class _Adapter implements HttpClientAdapter {
  _Adapter(this.handler);

  final ResponseBody Function(RequestOptions options) handler;
  RequestOptions? lastRequest;

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<List<int>>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    lastRequest = options;
    return handler(options);
  }

  @override
  void close({bool force = false}) {}
}

Dio _dioWith(_Adapter adapter) {
  final dio = Dio(BaseOptions(baseUrl: 'http://test'));
  dio.httpClientAdapter = adapter;
  return dio;
}

void main() {
  group('rewardsSnapshotProvider', () {
    test('parses rewards snapshot payload', () async {
      final adapter = _Adapter((_) {
        return ResponseBody.fromString(
          jsonEncode({
            'subscriptionTier': 'premium',
            'reputationLevel': 3,
            'reputationBand': 'established',
            'availableRewardLevels': [1, 2, 3, 4, 5],
            'maxOptionsPerLevel': 1,
            'redemptionStatus': 'active',
            'fraudRiskStatus': 'normal',
            'offers': [
              {
                'id': 'lvl1-privacy-basics',
                'rewardLevel': 1,
                'title': 'Privacy Starter Pack',
                'description': 'desc',
                'partnerName': 'Partner',
                'locked': false,
                'redeemed': false,
              },
            ],
            'redemptionHistory': <Map<String, dynamic>>[],
            'affiliateDisclosure': 'affiliate text',
          }),
          200,
          headers: {
            Headers.contentTypeHeader: ['application/json'],
          },
        );
      });

      final container = ProviderContainer(
        overrides: [secureDioProvider.overrideWithValue(_dioWith(adapter))],
      );

      final snapshot = await container.read(rewardsSnapshotProvider.future);
      expect(snapshot.subscriptionTier, 'premium');
      expect(snapshot.reputationLevel, 3);
      expect(snapshot.offers.length, 1);
      expect(snapshot.offers.first.title, 'Privacy Starter Pack');
      expect(adapter.lastRequest?.path, '/rewards/me');
    });
  });

  group('redeemRewardProvider', () {
    test('posts to redeem endpoint and parses redemption', () async {
      final adapter = _Adapter((_) {
        return ResponseBody.fromString(
          jsonEncode({
            'id': 'r1',
            'rewardId': 'lvl1-privacy-basics',
            'rewardLevel': 1,
            'rewardTitle': 'Privacy Starter Pack',
            'redeemedAt': '2026-05-27T00:00:00.000Z',
            'status': 'redeemed',
          }),
          201,
          headers: {
            Headers.contentTypeHeader: ['application/json'],
          },
        );
      });

      final container = ProviderContainer(
        overrides: [secureDioProvider.overrideWithValue(_dioWith(adapter))],
      );

      final redemption = await container.read(
        redeemRewardProvider('lvl1-privacy-basics').future,
      );

      expect(adapter.lastRequest?.method, 'POST');
      expect(adapter.lastRequest?.path, '/rewards/lvl1-privacy-basics/redeem');
      expect(redemption.rewardId, 'lvl1-privacy-basics');
      expect(redemption.status, 'redeemed');
    });
  });
}
