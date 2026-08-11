//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'cursor_page.g.dart';

/// CursorPage
///
/// Properties:
/// * [nextCursor] - Opaque cursor for the next page, or null when exhausted.
@BuiltValue(instantiable: false)
abstract class CursorPage  {
  /// Opaque cursor for the next page, or null when exhausted.
  @BuiltValueField(wireName: r'nextCursor')
  String? get nextCursor;

  @BuiltValueSerializer(custom: true)
  static Serializer<CursorPage> get serializer => _$CursorPageSerializer();
}

class _$CursorPageSerializer implements PrimitiveSerializer<CursorPage> {
  @override
  final Iterable<Type> types = const [CursorPage];

  @override
  final String wireName = r'CursorPage';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    CursorPage object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    yield r'nextCursor';
    yield object.nextCursor == null ? null : serializers.serialize(
      object.nextCursor,
      specifiedType: const FullType.nullable(String),
    );
  }

  @override
  Object serialize(
    Serializers serializers,
    CursorPage object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  @override
  CursorPage deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return serializers.deserialize(serialized, specifiedType: FullType($CursorPage)) as $CursorPage;
  }
}

/// a concrete implementation of [CursorPage], since [CursorPage] is not instantiable
@BuiltValue(instantiable: true)
abstract class $CursorPage implements CursorPage, Built<$CursorPage, $CursorPageBuilder> {
  $CursorPage._();

  factory $CursorPage([void Function($CursorPageBuilder)? updates]) = _$$CursorPage;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults($CursorPageBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<$CursorPage> get serializer => _$$CursorPageSerializer();
}

class _$$CursorPageSerializer implements PrimitiveSerializer<$CursorPage> {
  @override
  final Iterable<Type> types = const [$CursorPage, _$$CursorPage];

  @override
  final String wireName = r'$CursorPage';

  @override
  Object serialize(
    Serializers serializers,
    $CursorPage object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return serializers.serialize(object, specifiedType: FullType(CursorPage))!;
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required CursorPageBuilder result,
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
        default:
          unhandled.add(key);
          unhandled.add(value);
          break;
      }
    }
  }

  @override
  $CursorPage deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = $CursorPageBuilder();
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
