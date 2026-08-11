//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:lythaus_api_client/src/model/reaction_counts.dart';
import 'package:built_collection/built_collection.dart';
import 'package:lythaus_api_client/src/model/public_authorship_label.dart';
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'feed_item.g.dart';

/// FeedItem
///
/// Properties:
/// * [id]
/// * [authorId]
/// * [body]
/// * [publishedAt]
/// * [publicLabel]
/// * [reactionCounts]
/// * [viewerReaction]
/// * [topic]
/// * [regionCode]
@BuiltValue()
abstract class FeedItem implements Built<FeedItem, FeedItemBuilder> {
  @BuiltValueField(wireName: r'id')
  String get id;

  @BuiltValueField(wireName: r'authorId')
  String get authorId;

  @BuiltValueField(wireName: r'body')
  String get body;

  @BuiltValueField(wireName: r'publishedAt')
  DateTime get publishedAt;

  @BuiltValueField(wireName: r'publicLabel')
  PublicAuthorshipLabel get publicLabel;
  // enum publicLabelEnum {  Human-authored,  AI-assisted,  };

  @BuiltValueField(wireName: r'reactionCounts')
  ReactionCounts get reactionCounts;

  @BuiltValueField(wireName: r'viewerReaction')
  FeedItemViewerReactionEnum? get viewerReaction;
  // enum viewerReactionEnum {  like,  insightful,  support,  };

  @BuiltValueField(wireName: r'topic')
  String? get topic;

  @BuiltValueField(wireName: r'regionCode')
  String? get regionCode;

  FeedItem._();

  factory FeedItem([void updates(FeedItemBuilder b)]) = _$FeedItem;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(FeedItemBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<FeedItem> get serializer => _$FeedItemSerializer();
}

class _$FeedItemSerializer implements PrimitiveSerializer<FeedItem> {
  @override
  final Iterable<Type> types = const [FeedItem, _$FeedItem];

  @override
  final String wireName = r'FeedItem';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    FeedItem object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    yield r'id';
    yield serializers.serialize(
      object.id,
      specifiedType: const FullType(String),
    );
    yield r'authorId';
    yield serializers.serialize(
      object.authorId,
      specifiedType: const FullType(String),
    );
    yield r'body';
    yield serializers.serialize(
      object.body,
      specifiedType: const FullType(String),
    );
    yield r'publishedAt';
    yield serializers.serialize(
      object.publishedAt,
      specifiedType: const FullType(DateTime),
    );
    yield r'publicLabel';
    yield serializers.serialize(
      object.publicLabel,
      specifiedType: const FullType(PublicAuthorshipLabel),
    );
    yield r'reactionCounts';
    yield serializers.serialize(
      object.reactionCounts,
      specifiedType: const FullType(ReactionCounts),
    );
    yield r'viewerReaction';
    yield object.viewerReaction == null ? null : serializers.serialize(
      object.viewerReaction,
      specifiedType: const FullType.nullable(FeedItemViewerReactionEnum),
    );
    if (object.topic != null) {
      yield r'topic';
      yield serializers.serialize(
        object.topic,
        specifiedType: const FullType.nullable(String),
      );
    }
    if (object.regionCode != null) {
      yield r'regionCode';
      yield serializers.serialize(
        object.regionCode,
        specifiedType: const FullType.nullable(String),
      );
    }
  }

  @override
  Object serialize(
    Serializers serializers,
    FeedItem object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required FeedItemBuilder result,
    required List<Object?> unhandled,
  }) {
    for (var i = 0; i < serializedList.length; i += 2) {
      final key = serializedList[i] as String;
      final value = serializedList[i + 1];
      switch (key) {
        case r'id':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.id = valueDes;
          break;
        case r'authorId':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.authorId = valueDes;
          break;
        case r'body':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.body = valueDes;
          break;
        case r'publishedAt':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(DateTime),
          ) as DateTime;
          result.publishedAt = valueDes;
          break;
        case r'publicLabel':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(PublicAuthorshipLabel),
          ) as PublicAuthorshipLabel;
          result.publicLabel = valueDes;
          break;
        case r'reactionCounts':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(ReactionCounts),
          ) as ReactionCounts;
          result.reactionCounts.replace(valueDes);
          break;
        case r'viewerReaction':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType.nullable(FeedItemViewerReactionEnum),
          ) as FeedItemViewerReactionEnum?;
          if (valueDes == null) continue;
          result.viewerReaction = valueDes;
          break;
        case r'topic':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType.nullable(String),
          ) as String?;
          if (valueDes == null) continue;
          result.topic = valueDes;
          break;
        case r'regionCode':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType.nullable(String),
          ) as String?;
          if (valueDes == null) continue;
          result.regionCode = valueDes;
          break;
        default:
          unhandled.add(key);
          unhandled.add(value);
          break;
      }
    }
  }

  @override
  FeedItem deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = FeedItemBuilder();
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

class FeedItemViewerReactionEnum extends EnumClass {

  @BuiltValueEnumConst(wireName: r'like')
  static const FeedItemViewerReactionEnum like = _$feedItemViewerReactionEnum_like;
  @BuiltValueEnumConst(wireName: r'insightful')
  static const FeedItemViewerReactionEnum insightful = _$feedItemViewerReactionEnum_insightful;
  @BuiltValueEnumConst(wireName: r'support')
  static const FeedItemViewerReactionEnum support = _$feedItemViewerReactionEnum_support;

  static Serializer<FeedItemViewerReactionEnum> get serializer => _$feedItemViewerReactionEnumSerializer;

  const FeedItemViewerReactionEnum._(String name): super(name);

  static BuiltSet<FeedItemViewerReactionEnum> get values => _$feedItemViewerReactionEnumValues;
  static FeedItemViewerReactionEnum valueOf(String name) => _$feedItemViewerReactionEnumValueOf(name);
}
