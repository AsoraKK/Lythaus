//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:lythaus_api_client/src/model/overview_metric.dart';
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'admin_overview_metrics.g.dart';

/// AdminOverviewMetrics
///
/// Properties:
/// * [posts]
/// * [comments]
/// * [commentsPerPost]
/// * [unansweredPosts]
/// * [uniqueContributors]
/// * [newRegistrations]
/// * [subscriptionsFree]
/// * [subscriptionsPremium]
/// * [subscriptionsBlack]
@BuiltValue()
abstract class AdminOverviewMetrics implements Built<AdminOverviewMetrics, AdminOverviewMetricsBuilder> {
  @BuiltValueField(wireName: r'posts')
  OverviewMetric get posts;

  @BuiltValueField(wireName: r'comments')
  OverviewMetric get comments;

  @BuiltValueField(wireName: r'commentsPerPost')
  OverviewMetric get commentsPerPost;

  @BuiltValueField(wireName: r'unansweredPosts')
  OverviewMetric get unansweredPosts;

  @BuiltValueField(wireName: r'uniqueContributors')
  OverviewMetric get uniqueContributors;

  @BuiltValueField(wireName: r'newRegistrations')
  OverviewMetric get newRegistrations;

  @BuiltValueField(wireName: r'subscriptionsFree')
  OverviewMetric get subscriptionsFree;

  @BuiltValueField(wireName: r'subscriptionsPremium')
  OverviewMetric get subscriptionsPremium;

  @BuiltValueField(wireName: r'subscriptionsBlack')
  OverviewMetric get subscriptionsBlack;

  AdminOverviewMetrics._();

  factory AdminOverviewMetrics([void updates(AdminOverviewMetricsBuilder b)]) = _$AdminOverviewMetrics;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(AdminOverviewMetricsBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<AdminOverviewMetrics> get serializer => _$AdminOverviewMetricsSerializer();
}

class _$AdminOverviewMetricsSerializer implements PrimitiveSerializer<AdminOverviewMetrics> {
  @override
  final Iterable<Type> types = const [AdminOverviewMetrics, _$AdminOverviewMetrics];

  @override
  final String wireName = r'AdminOverviewMetrics';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    AdminOverviewMetrics object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    yield r'posts';
    yield serializers.serialize(
      object.posts,
      specifiedType: const FullType(OverviewMetric),
    );
    yield r'comments';
    yield serializers.serialize(
      object.comments,
      specifiedType: const FullType(OverviewMetric),
    );
    yield r'commentsPerPost';
    yield serializers.serialize(
      object.commentsPerPost,
      specifiedType: const FullType(OverviewMetric),
    );
    yield r'unansweredPosts';
    yield serializers.serialize(
      object.unansweredPosts,
      specifiedType: const FullType(OverviewMetric),
    );
    yield r'uniqueContributors';
    yield serializers.serialize(
      object.uniqueContributors,
      specifiedType: const FullType(OverviewMetric),
    );
    yield r'newRegistrations';
    yield serializers.serialize(
      object.newRegistrations,
      specifiedType: const FullType(OverviewMetric),
    );
    yield r'subscriptionsFree';
    yield serializers.serialize(
      object.subscriptionsFree,
      specifiedType: const FullType(OverviewMetric),
    );
    yield r'subscriptionsPremium';
    yield serializers.serialize(
      object.subscriptionsPremium,
      specifiedType: const FullType(OverviewMetric),
    );
    yield r'subscriptionsBlack';
    yield serializers.serialize(
      object.subscriptionsBlack,
      specifiedType: const FullType(OverviewMetric),
    );
  }

  @override
  Object serialize(
    Serializers serializers,
    AdminOverviewMetrics object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required AdminOverviewMetricsBuilder result,
    required List<Object?> unhandled,
  }) {
    for (var i = 0; i < serializedList.length; i += 2) {
      final key = serializedList[i] as String;
      final value = serializedList[i + 1];
      switch (key) {
        case r'posts':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(OverviewMetric),
          ) as OverviewMetric;
          result.posts.replace(valueDes);
          break;
        case r'comments':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(OverviewMetric),
          ) as OverviewMetric;
          result.comments.replace(valueDes);
          break;
        case r'commentsPerPost':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(OverviewMetric),
          ) as OverviewMetric;
          result.commentsPerPost.replace(valueDes);
          break;
        case r'unansweredPosts':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(OverviewMetric),
          ) as OverviewMetric;
          result.unansweredPosts.replace(valueDes);
          break;
        case r'uniqueContributors':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(OverviewMetric),
          ) as OverviewMetric;
          result.uniqueContributors.replace(valueDes);
          break;
        case r'newRegistrations':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(OverviewMetric),
          ) as OverviewMetric;
          result.newRegistrations.replace(valueDes);
          break;
        case r'subscriptionsFree':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(OverviewMetric),
          ) as OverviewMetric;
          result.subscriptionsFree.replace(valueDes);
          break;
        case r'subscriptionsPremium':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(OverviewMetric),
          ) as OverviewMetric;
          result.subscriptionsPremium.replace(valueDes);
          break;
        case r'subscriptionsBlack':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(OverviewMetric),
          ) as OverviewMetric;
          result.subscriptionsBlack.replace(valueDes);
          break;
        default:
          unhandled.add(key);
          unhandled.add(value);
          break;
      }
    }
  }

  @override
  AdminOverviewMetrics deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = AdminOverviewMetricsBuilder();
    final serializedList = (serialized as Iterable<Object?>).toList();
    final unhandled = <Object?>[];
    _deserializeProperties(
      serializers,
      serialized,
      specifiedType: specifiedType,
      serializedList: serializedList,
      unhandled: unhandled,
      result: result,
    );
    return result.build();
  }
}
