//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:built_collection/built_collection.dart';
import 'package:lythaus_api_client/src/model/custom_feed_rule.dart';
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'custom_feed_create_request.g.dart';

/// CustomFeedCreateRequest
///
/// Properties:
/// * [name]
/// * [rules]
@BuiltValue()
abstract class CustomFeedCreateRequest implements Built<CustomFeedCreateRequest, CustomFeedCreateRequestBuilder> {
  @BuiltValueField(wireName: r'name')
  String get name;

  @BuiltValueField(wireName: r'rules')
  BuiltList<CustomFeedRule?> get rules;

  CustomFeedCreateRequest._();

  factory CustomFeedCreateRequest([void updates(CustomFeedCreateRequestBuilder b)]) = _$CustomFeedCreateRequest;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(CustomFeedCreateRequestBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<CustomFeedCreateRequest> get serializer => _$CustomFeedCreateRequestSerializer();
}

class _$CustomFeedCreateRequestSerializer implements PrimitiveSerializer<CustomFeedCreateRequest> {
  @override
  final Iterable<Type> types = const [CustomFeedCreateRequest, _$CustomFeedCreateRequest];

  @override
  final String wireName = r'CustomFeedCreateRequest';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    CustomFeedCreateRequest object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    yield r'name';
    yield serializers.serialize(
      object.name,
      specifiedType: const FullType(String),
    );
    yield r'rules';
    yield serializers.serialize(
      object.rules,
      specifiedType: const FullType(BuiltList, [FullType.nullable(CustomFeedRule)]),
    );
  }

  @override
  Object serialize(
    Serializers serializers,
    CustomFeedCreateRequest object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required CustomFeedCreateRequestBuilder result,
    required List<Object?> unhandled,
  }) {
    for (var i = 0; i < serializedList.length; i += 2) {
      final key = serializedList[i] as String;
      final value = serializedList[i + 1];
      switch (key) {
        case r'name':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.name = valueDes;
          break;
        case r'rules':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(BuiltList, [FullType.nullable(CustomFeedRule)]),
          ) as BuiltList<CustomFeedRule?>;
          result.rules.replace(valueDes);
          break;
        default:
          unhandled.add(key);
          unhandled.add(value);
          break;
      }
    }
  }

  @override
  CustomFeedCreateRequest deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = CustomFeedCreateRequestBuilder();
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
