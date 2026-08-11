//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:lythaus_api_client/src/model/reaction_counts.dart';
import 'package:built_collection/built_collection.dart';
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'news_board_item.g.dart';

/// The Worker retains a redundant legacy `published_at` field for compatibility; clients consume the canonical `publishedAt` field.
///
/// Properties:
/// * [id]
/// * [title]
/// * [postId]
/// * [body]
/// * [authorId]
/// * [publishedAt]
/// * [reactionCounts]
/// * [viewerReaction]
@BuiltValue()
abstract class NewsBoardItem implements Built<NewsBoardItem, NewsBoardItemBuilder> {
  @BuiltValueField(wireName: r'id')
  String get id;

  @BuiltValueField(wireName: r'title')
  String get title;

  @BuiltValueField(wireName: r'post_id')
  String? get postId;

  @BuiltValueField(wireName: r'body')
  String? get body;

  @BuiltValueField(wireName: r'authorId')
  String? get authorId;

  @BuiltValueField(wireName: r'publishedAt')
  DateTime get publishedAt;

  @BuiltValueField(wireName: r'reactionCounts')
  ReactionCounts get reactionCounts;

  @BuiltValueField(wireName: r'viewerReaction')
  NewsBoardItemViewerReactionEnum? get viewerReaction;
  // enum viewerReactionEnum {  like,  insightful,  support,  };

  NewsBoardItem._();

  factory NewsBoardItem([void updates(NewsBoardItemBuilder b)]) = _$NewsBoardItem;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(NewsBoardItemBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<NewsBoardItem> get serializer => _$NewsBoardItemSerializer();
}

class _$NewsBoardItemSerializer implements PrimitiveSerializer<NewsBoardItem> {
  @override
  final Iterable<Type> types = const [NewsBoardItem, _$NewsBoardItem];

  @override
  final String wireName = r'NewsBoardItem';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    NewsBoardItem object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    yield r'id';
    yield serializers.serialize(
      object.id,
      specifiedType: const FullType(String),
    );
    yield r'title';
    yield serializers.serialize(
      object.title,
      specifiedType: const FullType(String),
    );
    if (object.postId != null) {
      yield r'post_id';
      yield serializers.serialize(
        object.postId,
        specifiedType: const FullType.nullable(String),
      );
    }
    if (object.body != null) {
      yield r'body';
      yield serializers.serialize(
        object.body,
        specifiedType: const FullType.nullable(String),
      );
    }
    if (object.authorId != null) {
      yield r'authorId';
      yield serializers.serialize(
        object.authorId,
        specifiedType: const FullType.nullable(String),
      );
    }
    yield r'publishedAt';
    yield serializers.serialize(
      object.publishedAt,
      specifiedType: const FullType(DateTime),
    );
    yield r'reactionCounts';
    yield serializers.serialize(
      object.reactionCounts,
      specifiedType: const FullType(ReactionCounts),
    );
    yield r'viewerReaction';
    yield object.viewerReaction == null ? null : serializers.serialize(
      object.viewerReaction,
      specifiedType: const FullType.nullable(NewsBoardItemViewerReactionEnum),
    );
  }

  @override
  Object serialize(
    Serializers serializers,
    NewsBoardItem object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required NewsBoardItemBuilder result,
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
        case r'title':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.title = valueDes;
          break;
        case r'post_id':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType.nullable(String),
          ) as String?;
          if (valueDes == null) continue;
          result.postId = valueDes;
          break;
        case r'body':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType.nullable(String),
          ) as String?;
          if (valueDes == null) continue;
          result.body = valueDes;
          break;
        case r'authorId':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType.nullable(String),
          ) as String?;
          if (valueDes == null) continue;
          result.authorId = valueDes;
          break;
        case r'publishedAt':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(DateTime),
          ) as DateTime;
          result.publishedAt = valueDes;
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
            specifiedType: const FullType.nullable(NewsBoardItemViewerReactionEnum),
          ) as NewsBoardItemViewerReactionEnum?;
          if (valueDes == null) continue;
          result.viewerReaction = valueDes;
          break;
        default:
          unhandled.add(key);
          unhandled.add(value);
          break;
      }
    }
  }

  @override
  NewsBoardItem deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = NewsBoardItemBuilder();
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

class NewsBoardItemViewerReactionEnum extends EnumClass {

  @BuiltValueEnumConst(wireName: r'like')
  static const NewsBoardItemViewerReactionEnum like = _$newsBoardItemViewerReactionEnum_like;
  @BuiltValueEnumConst(wireName: r'insightful')
  static const NewsBoardItemViewerReactionEnum insightful = _$newsBoardItemViewerReactionEnum_insightful;
  @BuiltValueEnumConst(wireName: r'support')
  static const NewsBoardItemViewerReactionEnum support = _$newsBoardItemViewerReactionEnum_support;

  static Serializer<NewsBoardItemViewerReactionEnum> get serializer => _$newsBoardItemViewerReactionEnumSerializer;

  const NewsBoardItemViewerReactionEnum._(String name): super(name);

  static BuiltSet<NewsBoardItemViewerReactionEnum> get values => _$newsBoardItemViewerReactionEnumValues;
  static NewsBoardItemViewerReactionEnum valueOf(String name) => _$newsBoardItemViewerReactionEnumValueOf(name);
}
