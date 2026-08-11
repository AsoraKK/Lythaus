//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:built_collection/built_collection.dart';
import 'package:lythaus_api_client/src/model/custom_feed_rule.dart';
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'custom_feed_update_request.g.dart';

/// CustomFeedUpdateRequest
///
/// Properties:
/// * [name]
/// * [rules]
@BuiltValue()
abstract class CustomFeedUpdateRequest implements Built<CustomFeedUpdateRequest, CustomFeedUpdateRequestBuilder> {
  @BuiltValueField(wireName: r'name')
  String? get name;

  @BuiltValueField(wireName: r'rules')
  BuiltList<CustomFeedRule?>? get rules;

  CustomFeedUpdateRequest._();

  factory CustomFeedUpdateRequest([void updates(CustomFeedUpdateRequestBuilder b)]) = _$CustomFeedUpdateRequest;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(CustomFeedUpdateRequestBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<CustomFeedUpdateRequest> get serializer => _$CustomFeedUpdateRequestSerializer();
}

class _$CustomFeedUpdateRequestSerializer implements PrimitiveSerializer<CustomFeedUpdateRequest> {
  @override
  final Iterable<Type> types = const [CustomFeedUpdateRequest, _$CustomFeedUpdateRequest];

  @override
  final String wireName = r'CustomFeedUpdateRequest';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    CustomFeedUpdateRequest object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    if (object.name != null) {
      yield r'name';
      yield serializers.serialize(
        object.name,
        specifiedType: const FullType(String),
      );
    }
    if (object.rules != null) {
      yield r'rules';
      yield serializers.serialize(
        object.rules,
        specifiedType: const FullType(BuiltList, [FullType.nullable(CustomFeedRule)]),
      );
    }
  }

  @override
  Object serialize(
    Serializers serializers,
    CustomFeedUpdateRequest object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required CustomFeedUpdateRequestBuilder result,
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
  CustomFeedUpdateRequest deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = CustomFeedUpdateRequestBuilder();
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
