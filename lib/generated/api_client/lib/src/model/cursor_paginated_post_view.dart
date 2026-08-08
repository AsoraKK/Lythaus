//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:built_collection/built_collection.dart';
import 'package:lythaus_api_client/src/model/post_view.dart';
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'cursor_paginated_post_view.g.dart';

/// CursorPaginatedPostView
///
/// Properties:
/// * [items]
/// * [nextCursor]
@BuiltValue(instantiable: false)
abstract class CursorPaginatedPostView  {
  @BuiltValueField(wireName: r'items')
  BuiltList<PostView> get items;

  @BuiltValueField(wireName: r'nextCursor')
  String? get nextCursor;

  @BuiltValueSerializer(custom: true)
  static Serializer<CursorPaginatedPostView> get serializer => _$CursorPaginatedPostViewSerializer();
}

class _$CursorPaginatedPostViewSerializer implements PrimitiveSerializer<CursorPaginatedPostView> {
  @override
  final Iterable<Type> types = const [CursorPaginatedPostView];

  @override
  final String wireName = r'CursorPaginatedPostView';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    CursorPaginatedPostView object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    yield r'items';
    yield serializers.serialize(
      object.items,
      specifiedType: const FullType(BuiltList, [FullType(PostView)]),
    );
    if (object.nextCursor != null) {
      yield r'nextCursor';
      yield serializers.serialize(
        object.nextCursor,
        specifiedType: const FullType.nullable(String),
      );
    }
  }

  @override
  Object serialize(
    Serializers serializers,
    CursorPaginatedPostView object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  @override
  CursorPaginatedPostView deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return serializers.deserialize(serialized, specifiedType: FullType($CursorPaginatedPostView)) as $CursorPaginatedPostView;
  }
}

/// a concrete implementation of [CursorPaginatedPostView], since [CursorPaginatedPostView] is not instantiable
@BuiltValue(instantiable: true)
abstract class $CursorPaginatedPostView implements CursorPaginatedPostView, Built<$CursorPaginatedPostView, $CursorPaginatedPostViewBuilder> {
  $CursorPaginatedPostView._();

  factory $CursorPaginatedPostView([void Function($CursorPaginatedPostViewBuilder)? updates]) = _$$CursorPaginatedPostView;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults($CursorPaginatedPostViewBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<$CursorPaginatedPostView> get serializer => _$$CursorPaginatedPostViewSerializer();
}

class _$$CursorPaginatedPostViewSerializer implements PrimitiveSerializer<$CursorPaginatedPostView> {
  @override
  final Iterable<Type> types = const [$CursorPaginatedPostView, _$$CursorPaginatedPostView];

  @override
  final String wireName = r'$CursorPaginatedPostView';

  @override
  Object serialize(
    Serializers serializers,
    $CursorPaginatedPostView object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return serializers.serialize(object, specifiedType: FullType(CursorPaginatedPostView))!;
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required CursorPaginatedPostViewBuilder result,
    required List<Object?> unhandled,
  }) {
    for (var i = 0; i < serializedList.length; i += 2) {
      final key = serializedList[i] as String;
      final value = serializedList[i + 1];
      switch (key) {
        case r'items':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(BuiltList, [FullType(PostView)]),
          ) as BuiltList<PostView>;
          result.items.replace(valueDes);
          break;
        case r'nextCursor':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType.nullable(String),
          ) as String?;
          if (valueDes == null) continue;
          result.nextCursor = valueDes;
          break;
        default:
          unhandled.add(key);
          unhandled.add(value);
          break;
      }
    }
  }

  @override
  $CursorPaginatedPostView deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = $CursorPaginatedPostViewBuilder();
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
