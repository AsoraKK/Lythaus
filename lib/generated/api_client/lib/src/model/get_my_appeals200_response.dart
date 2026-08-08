//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:built_collection/built_collection.dart';
import 'package:lythaus_api_client/src/model/get_my_appeals200_response_items_inner.dart';
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'get_my_appeals200_response.g.dart';

/// GetMyAppeals200Response
///
/// Properties:
/// * [items]
/// * [nextCursor]
@BuiltValue()
abstract class GetMyAppeals200Response implements Built<GetMyAppeals200Response, GetMyAppeals200ResponseBuilder> {
  @BuiltValueField(wireName: r'items')
  BuiltList<GetMyAppeals200ResponseItemsInner>? get items;

  @BuiltValueField(wireName: r'nextCursor')
  String? get nextCursor;

  GetMyAppeals200Response._();

  factory GetMyAppeals200Response([void updates(GetMyAppeals200ResponseBuilder b)]) = _$GetMyAppeals200Response;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(GetMyAppeals200ResponseBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<GetMyAppeals200Response> get serializer => _$GetMyAppeals200ResponseSerializer();
}

class _$GetMyAppeals200ResponseSerializer implements PrimitiveSerializer<GetMyAppeals200Response> {
  @override
  final Iterable<Type> types = const [GetMyAppeals200Response, _$GetMyAppeals200Response];

  @override
  final String wireName = r'GetMyAppeals200Response';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    GetMyAppeals200Response object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    if (object.items != null) {
      yield r'items';
      yield serializers.serialize(
        object.items,
        specifiedType: const FullType(BuiltList, [FullType(GetMyAppeals200ResponseItemsInner)]),
      );
    }
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
    GetMyAppeals200Response object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required GetMyAppeals200ResponseBuilder result,
    required List<Object?> unhandled,
  }) {
    for (var i = 0; i < serializedList.length; i += 2) {
      final key = serializedList[i] as String;
      final value = serializedList[i + 1];
      switch (key) {
        case r'items':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(BuiltList, [FullType(GetMyAppeals200ResponseItemsInner)]),
          ) as BuiltList<GetMyAppeals200ResponseItemsInner>;
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
  GetMyAppeals200Response deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = GetMyAppeals200ResponseBuilder();
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
