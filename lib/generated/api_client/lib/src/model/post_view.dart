//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:lythaus_api_client/src/model/post_trust_timeline.dart';
import 'package:lythaus_api_client/src/model/post_view_all_of_recent_comments.dart';
import 'package:built_collection/built_collection.dart';
import 'package:lythaus_api_client/src/model/post.dart';
import 'package:lythaus_api_client/src/model/public_authorship.dart';
import 'package:built_value/json_object.dart';
import 'package:lythaus_api_client/src/model/news_source_metadata.dart';
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'post_view.g.dart';

/// PostView
///
/// Properties:
/// * [id]
/// * [authorId]
/// * [content]
/// * [contentType]
/// * [mediaUrls]
/// * [topics]
/// * [visibility]
/// * [isNews]
/// * [source_]
/// * [clusterId]
/// * [authorship]
/// * [createdAt]
/// * [updatedAt]
/// * [author]
/// * [authorRole]
/// * [likeCount]
/// * [commentCount]
/// * [bookmarkCount]
/// * [viewCount]
/// * [viewerHasLiked]
/// * [viewerHasBookmarked]
/// * [viewerFollowsAuthor]
/// * [authorFollowerCount]
/// * [recentComments]
/// * [badges]
/// * [trustStatus]
/// * [timeline]
/// * [hasAppeal]
/// * [proofSignalsProvided]
/// * [verifiedContextBadgeEligible]
/// * [featuredEligible]
@BuiltValue()
abstract class PostView implements Post, Built<PostView, PostViewBuilder> {
  @BuiltValueField(wireName: r'trustStatus')
  PostViewTrustStatusEnum get trustStatus;
  // enum trustStatusEnum {  verified_signals_attached,  no_extra_signals,  under_appeal,  actioned,  };

  @BuiltValueField(wireName: r'authorRole')
  PostViewAuthorRoleEnum get authorRole;
  // enum authorRoleEnum {  journalist,  contributor,  user,  };

  @BuiltValueField(wireName: r'author')
  BuiltMap<String, JsonObject?> get author;

  @BuiltValueField(wireName: r'likeCount')
  int get likeCount;

  @BuiltValueField(wireName: r'recentComments')
  BuiltList<PostViewAllOfRecentComments>? get recentComments;

  @BuiltValueField(wireName: r'viewerHasBookmarked')
  bool? get viewerHasBookmarked;

  @BuiltValueField(wireName: r'authorFollowerCount')
  int? get authorFollowerCount;

  @BuiltValueField(wireName: r'commentCount')
  int get commentCount;

  @BuiltValueField(wireName: r'badges')
  BuiltList<String>? get badges;

  @BuiltValueField(wireName: r'proofSignalsProvided')
  bool get proofSignalsProvided;

  @BuiltValueField(wireName: r'verifiedContextBadgeEligible')
  bool get verifiedContextBadgeEligible;

  @BuiltValueField(wireName: r'viewerFollowsAuthor')
  bool? get viewerFollowsAuthor;

  @BuiltValueField(wireName: r'featuredEligible')
  bool get featuredEligible;

  @BuiltValueField(wireName: r'bookmarkCount')
  int? get bookmarkCount;

  @BuiltValueField(wireName: r'timeline')
  PostTrustTimeline get timeline;

  @BuiltValueField(wireName: r'viewerHasLiked')
  bool? get viewerHasLiked;

  @BuiltValueField(wireName: r'viewCount')
  int? get viewCount;

  @BuiltValueField(wireName: r'hasAppeal')
  bool get hasAppeal;

  PostView._();

  factory PostView([void updates(PostViewBuilder b)]) = _$PostView;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(PostViewBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<PostView> get serializer => _$PostViewSerializer();
}

class _$PostViewSerializer implements PrimitiveSerializer<PostView> {
  @override
  final Iterable<Type> types = const [PostView, _$PostView];

  @override
  final String wireName = r'PostView';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    PostView object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    yield r'likeCount';
    yield serializers.serialize(
      object.likeCount,
      specifiedType: const FullType(int),
    );
    if (object.recentComments != null) {
      yield r'recentComments';
      yield serializers.serialize(
        object.recentComments,
        specifiedType: const FullType(BuiltList, [FullType(PostViewAllOfRecentComments)]),
      );
    }
    if (object.clusterId != null) {
      yield r'clusterId';
      yield serializers.serialize(
        object.clusterId,
        specifiedType: const FullType(String),
      );
    }
    if (object.authorFollowerCount != null) {
      yield r'authorFollowerCount';
      yield serializers.serialize(
        object.authorFollowerCount,
        specifiedType: const FullType(int),
      );
    }
    yield r'content';
    yield serializers.serialize(
      object.content,
      specifiedType: const FullType(String),
    );
    yield r'proofSignalsProvided';
    yield serializers.serialize(
      object.proofSignalsProvided,
      specifiedType: const FullType(bool),
    );
    yield r'verifiedContextBadgeEligible';
    yield serializers.serialize(
      object.verifiedContextBadgeEligible,
      specifiedType: const FullType(bool),
    );
    yield r'createdAt';
    yield serializers.serialize(
      object.createdAt,
      specifiedType: const FullType(DateTime),
    );
    yield r'featuredEligible';
    yield serializers.serialize(
      object.featuredEligible,
      specifiedType: const FullType(bool),
    );
    yield r'authorship';
    yield serializers.serialize(
      object.authorship,
      specifiedType: const FullType(PublicAuthorship),
    );
    if (object.source_ != null) {
      yield r'source';
      yield serializers.serialize(
        object.source_,
        specifiedType: const FullType(NewsSourceMetadata),
      );
    }
    if (object.viewerHasLiked != null) {
      yield r'viewerHasLiked';
      yield serializers.serialize(
        object.viewerHasLiked,
        specifiedType: const FullType(bool),
      );
    }
    if (object.viewCount != null) {
      yield r'viewCount';
      yield serializers.serialize(
        object.viewCount,
        specifiedType: const FullType(int),
      );
    }
    yield r'id';
    yield serializers.serialize(
      object.id,
      specifiedType: const FullType(String),
    );
    yield r'hasAppeal';
    yield serializers.serialize(
      object.hasAppeal,
      specifiedType: const FullType(bool),
    );
    yield r'contentType';
    yield serializers.serialize(
      object.contentType,
      specifiedType: const FullType(PostContentTypeEnum),
    );
    yield r'updatedAt';
    yield serializers.serialize(
      object.updatedAt,
      specifiedType: const FullType(DateTime),
    );
    yield r'trustStatus';
    yield serializers.serialize(
      object.trustStatus,
      specifiedType: const FullType(PostViewTrustStatusEnum),
    );
    yield r'authorRole';
    yield serializers.serialize(
      object.authorRole,
      specifiedType: const FullType(PostViewAuthorRoleEnum),
    );
    yield r'visibility';
    yield serializers.serialize(
      object.visibility,
      specifiedType: const FullType(PostVisibilityEnum),
    );
    yield r'author';
    yield serializers.serialize(
      object.author,
      specifiedType: const FullType(BuiltMap, [FullType(String), FullType.nullable(JsonObject)]),
    );
    if (object.topics != null) {
      yield r'topics';
      yield serializers.serialize(
        object.topics,
        specifiedType: const FullType(BuiltList, [FullType(String)]),
      );
    }
    if (object.viewerHasBookmarked != null) {
      yield r'viewerHasBookmarked';
      yield serializers.serialize(
        object.viewerHasBookmarked,
        specifiedType: const FullType(bool),
      );
    }
    yield r'authorId';
    yield serializers.serialize(
      object.authorId,
      specifiedType: const FullType(String),
    );
    yield r'commentCount';
    yield serializers.serialize(
      object.commentCount,
      specifiedType: const FullType(int),
    );
    if (object.badges != null) {
      yield r'badges';
      yield serializers.serialize(
        object.badges,
        specifiedType: const FullType(BuiltList, [FullType(String)]),
      );
    }
    if (object.viewerFollowsAuthor != null) {
      yield r'viewerFollowsAuthor';
      yield serializers.serialize(
        object.viewerFollowsAuthor,
        specifiedType: const FullType(bool),
      );
    }
    if (object.bookmarkCount != null) {
      yield r'bookmarkCount';
      yield serializers.serialize(
        object.bookmarkCount,
        specifiedType: const FullType(int),
      );
    }
    yield r'timeline';
    yield serializers.serialize(
      object.timeline,
      specifiedType: const FullType(PostTrustTimeline),
    );
    yield r'isNews';
    yield serializers.serialize(
      object.isNews,
      specifiedType: const FullType(bool),
    );
    if (object.mediaUrls != null) {
      yield r'mediaUrls';
      yield serializers.serialize(
        object.mediaUrls,
        specifiedType: const FullType(BuiltList, [FullType(String)]),
      );
    }
  }

  @override
  Object serialize(
    Serializers serializers,
    PostView object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required PostViewBuilder result,
    required List<Object?> unhandled,
  }) {
    for (var i = 0; i < serializedList.length; i += 2) {
      final key = serializedList[i] as String;
      final value = serializedList[i + 1];
      switch (key) {
        case r'likeCount':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(int),
          ) as int;
          result.likeCount = valueDes;
          break;
        case r'recentComments':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(BuiltList, [FullType(PostViewAllOfRecentComments)]),
          ) as BuiltList<PostViewAllOfRecentComments>;
          result.recentComments.replace(valueDes);
          break;
        case r'clusterId':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.clusterId = valueDes;
          break;
        case r'authorFollowerCount':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(int),
          ) as int;
          result.authorFollowerCount = valueDes;
          break;
        case r'content':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.content = valueDes;
          break;
        case r'proofSignalsProvided':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(bool),
          ) as bool;
          result.proofSignalsProvided = valueDes;
          break;
        case r'verifiedContextBadgeEligible':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(bool),
          ) as bool;
          result.verifiedContextBadgeEligible = valueDes;
          break;
        case r'createdAt':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(DateTime),
          ) as DateTime;
          result.createdAt = valueDes;
          break;
        case r'featuredEligible':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(bool),
          ) as bool;
          result.featuredEligible = valueDes;
          break;
        case r'authorship':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(PublicAuthorship),
          ) as PublicAuthorship;
          result.authorship.replace(valueDes);
          break;
        case r'source':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(NewsSourceMetadata),
          ) as NewsSourceMetadata;
          result.source_.replace(valueDes);
          break;
        case r'viewerHasLiked':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(bool),
          ) as bool;
          result.viewerHasLiked = valueDes;
          break;
        case r'viewCount':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(int),
          ) as int;
          result.viewCount = valueDes;
          break;
        case r'id':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.id = valueDes;
          break;
        case r'hasAppeal':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(bool),
          ) as bool;
          result.hasAppeal = valueDes;
          break;
        case r'contentType':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(PostContentTypeEnum),
          ) as PostContentTypeEnum;
          result.contentType = valueDes;
          break;
        case r'updatedAt':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(DateTime),
          ) as DateTime;
          result.updatedAt = valueDes;
          break;
        case r'trustStatus':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(PostViewTrustStatusEnum),
          ) as PostViewTrustStatusEnum;
          result.trustStatus = valueDes;
          break;
        case r'authorRole':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(PostViewAuthorRoleEnum),
          ) as PostViewAuthorRoleEnum;
          result.authorRole = valueDes;
          break;
        case r'visibility':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(PostVisibilityEnum),
          ) as PostVisibilityEnum;
          result.visibility = valueDes;
          break;
        case r'author':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(BuiltMap, [FullType(String), FullType.nullable(JsonObject)]),
          ) as BuiltMap<String, JsonObject?>;
          result.author.replace(valueDes);
          break;
        case r'topics':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(BuiltList, [FullType(String)]),
          ) as BuiltList<String>;
          result.topics.replace(valueDes);
          break;
        case r'viewerHasBookmarked':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(bool),
          ) as bool;
          result.viewerHasBookmarked = valueDes;
          break;
        case r'authorId':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.authorId = valueDes;
          break;
        case r'commentCount':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(int),
          ) as int;
          result.commentCount = valueDes;
          break;
        case r'badges':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(BuiltList, [FullType(String)]),
          ) as BuiltList<String>;
          result.badges.replace(valueDes);
          break;
        case r'viewerFollowsAuthor':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(bool),
          ) as bool;
          result.viewerFollowsAuthor = valueDes;
          break;
        case r'bookmarkCount':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(int),
          ) as int;
          result.bookmarkCount = valueDes;
          break;
        case r'timeline':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(PostTrustTimeline),
          ) as PostTrustTimeline;
          result.timeline.replace(valueDes);
          break;
        case r'isNews':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(bool),
          ) as bool;
          result.isNews = valueDes;
          break;
        case r'mediaUrls':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(BuiltList, [FullType(String)]),
          ) as BuiltList<String>;
          result.mediaUrls.replace(valueDes);
          break;
        default:
          unhandled.add(key);
          unhandled.add(value);
          break;
      }
    }
  }

  @override
  PostView deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = PostViewBuilder();
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

class PostViewContentTypeEnum extends EnumClass {

  @BuiltValueEnumConst(wireName: r'text')
  static const PostViewContentTypeEnum text = _$postViewContentTypeEnum_text;
  @BuiltValueEnumConst(wireName: r'image')
  static const PostViewContentTypeEnum image = _$postViewContentTypeEnum_image;
  @BuiltValueEnumConst(wireName: r'video')
  static const PostViewContentTypeEnum video = _$postViewContentTypeEnum_video;
  @BuiltValueEnumConst(wireName: r'mixed')
  static const PostViewContentTypeEnum mixed = _$postViewContentTypeEnum_mixed;

  static Serializer<PostViewContentTypeEnum> get serializer => _$postViewContentTypeEnumSerializer;

  const PostViewContentTypeEnum._(String name): super(name);

  static BuiltSet<PostViewContentTypeEnum> get values => _$postViewContentTypeEnumValues;
  static PostViewContentTypeEnum valueOf(String name) => _$postViewContentTypeEnumValueOf(name);
}

class PostViewVisibilityEnum extends EnumClass {

  @BuiltValueEnumConst(wireName: r'public')
  static const PostViewVisibilityEnum public = _$postViewVisibilityEnum_public;
  @BuiltValueEnumConst(wireName: r'followers')
  static const PostViewVisibilityEnum followers = _$postViewVisibilityEnum_followers;
  @BuiltValueEnumConst(wireName: r'private')
  static const PostViewVisibilityEnum private = _$postViewVisibilityEnum_private;

  static Serializer<PostViewVisibilityEnum> get serializer => _$postViewVisibilityEnumSerializer;

  const PostViewVisibilityEnum._(String name): super(name);

  static BuiltSet<PostViewVisibilityEnum> get values => _$postViewVisibilityEnumValues;
  static PostViewVisibilityEnum valueOf(String name) => _$postViewVisibilityEnumValueOf(name);
}

class PostViewAuthorRoleEnum extends EnumClass {

  @BuiltValueEnumConst(wireName: r'journalist')
  static const PostViewAuthorRoleEnum journalist = _$postViewAuthorRoleEnum_journalist;
  @BuiltValueEnumConst(wireName: r'contributor')
  static const PostViewAuthorRoleEnum contributor = _$postViewAuthorRoleEnum_contributor;
  @BuiltValueEnumConst(wireName: r'user')
  static const PostViewAuthorRoleEnum user = _$postViewAuthorRoleEnum_user;

  static Serializer<PostViewAuthorRoleEnum> get serializer => _$postViewAuthorRoleEnumSerializer;

  const PostViewAuthorRoleEnum._(String name): super(name);

  static BuiltSet<PostViewAuthorRoleEnum> get values => _$postViewAuthorRoleEnumValues;
  static PostViewAuthorRoleEnum valueOf(String name) => _$postViewAuthorRoleEnumValueOf(name);
}

class PostViewTrustStatusEnum extends EnumClass {

  @BuiltValueEnumConst(wireName: r'verified_signals_attached')
  static const PostViewTrustStatusEnum verifiedSignalsAttached = _$postViewTrustStatusEnum_verifiedSignalsAttached;
  @BuiltValueEnumConst(wireName: r'no_extra_signals')
  static const PostViewTrustStatusEnum noExtraSignals = _$postViewTrustStatusEnum_noExtraSignals;
  @BuiltValueEnumConst(wireName: r'under_appeal')
  static const PostViewTrustStatusEnum underAppeal = _$postViewTrustStatusEnum_underAppeal;
  @BuiltValueEnumConst(wireName: r'actioned')
  static const PostViewTrustStatusEnum actioned = _$postViewTrustStatusEnum_actioned;

  static Serializer<PostViewTrustStatusEnum> get serializer => _$postViewTrustStatusEnumSerializer;

  const PostViewTrustStatusEnum._(String name): super(name);

  static BuiltSet<PostViewTrustStatusEnum> get values => _$postViewTrustStatusEnumValues;
  static PostViewTrustStatusEnum valueOf(String name) => _$postViewTrustStatusEnumValueOf(name);
}
