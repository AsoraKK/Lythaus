//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:built_collection/built_collection.dart';
import 'package:lythaus_api_client/src/model/owner_comment.dart';
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'owner_comments_page.g.dart';

/// OwnerCommentsPage
///
/// Properties:
/// * [items]
/// * [nextCursor]
/// * [correlationId]
@BuiltValue()
abstract class OwnerCommentsPage implements Built<OwnerCommentsPage, OwnerCommentsPageBuilder> {
  @BuiltValueField(wireName: r'items')
  BuiltList<OwnerComment> get items;

  @BuiltValueField(wireName: r'nextCursor')
  String? get nextCursor;

  @BuiltValueField(wireName: r'correlationId')
  String? get correlationId;

  OwnerCommentsPage._();

  factory OwnerCommentsPage([void updates(OwnerCommentsPageBuilder b)]) = _$OwnerCommentsPage;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(OwnerCommentsPageBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<OwnerCommentsPage> get serializer => _$OwnerCommentsPageSerializer();
}

class _$OwnerCommentsPageSerializer implements PrimitiveSerializer<OwnerCommentsPage> {
  @override
  final Iterable<Type> types = const [OwnerCommentsPage, _$OwnerCommentsPage];

  @override
  final String wireName = r'OwnerCommentsPage';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    OwnerCommentsPage object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    yield r'items';
    yield serializers.serialize(
      object.items,
      specifiedType: const FullType(BuiltList, [FullType(OwnerComment)]),
    );
    yield r'nextCursor';
    yield object.nextCursor == null ? null : serializers.serialize(
      object.nextCursor,
      specifiedType: const FullType.nullable(String),
    );
    if (object.correlationId != null) {
      yield r'correlationId';
      yield serializers.serialize(
        object.correlationId,
        specifiedType: const FullType(String),
      );
    }
  }

  @override
  Object serialize(
    Serializers serializers,
    OwnerCommentsPage object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required OwnerCommentsPageBuilder result,
    required List<Object?> unhandled,
  }) {
    for (var i = 0; i < serializedList.length; i += 2) {
      final key = serializedList[i] as String;
      final value = serializedList[i + 1];
      switch (key) {
        case r'items':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(BuiltList, [FullType(OwnerComment)]),
          ) as BuiltList<OwnerComment>;
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
        case r'correlationId':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.correlationId = valueDes;
          break;
        default:
          unhandled.add(key);
          unhandled.add(value);
          break;
      }
    }
  }

  @override
  OwnerCommentsPage deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = OwnerCommentsPageBuilder();
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
