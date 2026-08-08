//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:built_collection/built_collection.dart';
import 'package:lythaus_api_client/src/model/post_view.dart';
import 'package:lythaus_api_client/src/model/cursor_paginated_post_view.dart';
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'news_board_feed_response.g.dart';

/// NewsBoardFeedResponse
///
/// Properties:
/// * [items]
/// * [nextCursor]
/// * [accessLevel]
/// * [locked]
/// * [previewLimit]
@BuiltValue()
abstract class NewsBoardFeedResponse implements CursorPaginatedPostView, Built<NewsBoardFeedResponse, NewsBoardFeedResponseBuilder> {
  @BuiltValueField(wireName: r'accessLevel')
  NewsBoardFeedResponseAccessLevelEnum get accessLevel;
  // enum accessLevelEnum {  preview,  full,  };

  @BuiltValueField(wireName: r'previewLimit')
  int? get previewLimit;

  @BuiltValueField(wireName: r'locked')
  bool get locked;

  NewsBoardFeedResponse._();

  factory NewsBoardFeedResponse([void updates(NewsBoardFeedResponseBuilder b)]) = _$NewsBoardFeedResponse;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(NewsBoardFeedResponseBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<NewsBoardFeedResponse> get serializer => _$NewsBoardFeedResponseSerializer();
}

class _$NewsBoardFeedResponseSerializer implements PrimitiveSerializer<NewsBoardFeedResponse> {
  @override
  final Iterable<Type> types = const [NewsBoardFeedResponse, _$NewsBoardFeedResponse];

  @override
  final String wireName = r'NewsBoardFeedResponse';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    NewsBoardFeedResponse object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    if (object.nextCursor != null) {
      yield r'nextCursor';
      yield serializers.serialize(
        object.nextCursor,
        specifiedType: const FullType.nullable(String),
      );
    }
    yield r'accessLevel';
    yield serializers.serialize(
      object.accessLevel,
      specifiedType: const FullType(NewsBoardFeedResponseAccessLevelEnum),
    );
    yield r'locked';
    yield serializers.serialize(
      object.locked,
      specifiedType: const FullType(bool),
    );
    if (object.previewLimit != null) {
      yield r'previewLimit';
      yield serializers.serialize(
        object.previewLimit,
        specifiedType: const FullType(int),
      );
    }
    yield r'items';
    yield serializers.serialize(
      object.items,
      specifiedType: const FullType(BuiltList, [FullType(PostView)]),
    );
  }

  @override
  Object serialize(
    Serializers serializers,
    NewsBoardFeedResponse object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required NewsBoardFeedResponseBuilder result,
    required List<Object?> unhandled,
  }) {
    for (var i = 0; i < serializedList.length; i += 2) {
      final key = serializedList[i] as String;
      final value = serializedList[i + 1];
      switch (key) {
        case r'nextCursor':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType.nullable(String),
          ) as String?;
          if (valueDes == null) continue;
          result.nextCursor = valueDes;
          break;
        case r'accessLevel':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(NewsBoardFeedResponseAccessLevelEnum),
          ) as NewsBoardFeedResponseAccessLevelEnum;
          result.accessLevel = valueDes;
          break;
        case r'locked':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(bool),
          ) as bool;
          result.locked = valueDes;
          break;
        case r'previewLimit':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(int),
          ) as int;
          result.previewLimit = valueDes;
          break;
        case r'items':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(BuiltList, [FullType(PostView)]),
          ) as BuiltList<PostView>;
          result.items.replace(valueDes);
          break;
        default:
          unhandled.add(key);
          unhandled.add(value);
          break;
      }
    }
  }

  @override
  NewsBoardFeedResponse deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = NewsBoardFeedResponseBuilder();
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

class NewsBoardFeedResponseAccessLevelEnum extends EnumClass {

  @BuiltValueEnumConst(wireName: r'preview')
  static const NewsBoardFeedResponseAccessLevelEnum preview = _$newsBoardFeedResponseAccessLevelEnum_preview;
  @BuiltValueEnumConst(wireName: r'full')
  static const NewsBoardFeedResponseAccessLevelEnum full = _$newsBoardFeedResponseAccessLevelEnum_full;

  static Serializer<NewsBoardFeedResponseAccessLevelEnum> get serializer => _$newsBoardFeedResponseAccessLevelEnumSerializer;

  const NewsBoardFeedResponseAccessLevelEnum._(String name): super(name);

  static BuiltSet<NewsBoardFeedResponseAccessLevelEnum> get values => _$newsBoardFeedResponseAccessLevelEnumValues;
  static NewsBoardFeedResponseAccessLevelEnum valueOf(String name) => _$newsBoardFeedResponseAccessLevelEnumValueOf(name);
}
