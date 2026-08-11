//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:lythaus_api_client/src/model/storage_usage_get200_response_storage.dart';
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'storage_usage_get200_response.g.dart';

/// StorageUsageGet200Response
///
/// Properties:
/// * [storage]
@BuiltValue()
abstract class StorageUsageGet200Response implements Built<StorageUsageGet200Response, StorageUsageGet200ResponseBuilder> {
  @BuiltValueField(wireName: r'storage')
  StorageUsageGet200ResponseStorage get storage;

  StorageUsageGet200Response._();

  factory StorageUsageGet200Response([void updates(StorageUsageGet200ResponseBuilder b)]) = _$StorageUsageGet200Response;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(StorageUsageGet200ResponseBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<StorageUsageGet200Response> get serializer => _$StorageUsageGet200ResponseSerializer();
}

class _$StorageUsageGet200ResponseSerializer implements PrimitiveSerializer<StorageUsageGet200Response> {
  @override
  final Iterable<Type> types = const [StorageUsageGet200Response, _$StorageUsageGet200Response];

  @override
  final String wireName = r'StorageUsageGet200Response';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    StorageUsageGet200Response object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    yield r'storage';
    yield serializers.serialize(
      object.storage,
      specifiedType: const FullType(StorageUsageGet200ResponseStorage),
    );
  }

  @override
  Object serialize(
    Serializers serializers,
    StorageUsageGet200Response object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required StorageUsageGet200ResponseBuilder result,
    required List<Object?> unhandled,
  }) {
    for (var i = 0; i < serializedList.length; i += 2) {
      final key = serializedList[i] as String;
      final value = serializedList[i + 1];
      switch (key) {
        case r'storage':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(StorageUsageGet200ResponseStorage),
          ) as StorageUsageGet200ResponseStorage;
          result.storage.replace(valueDes);
          break;
        default:
          unhandled.add(key);
          unhandled.add(value);
          break;
      }
    }
  }

  @override
  StorageUsageGet200Response deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = StorageUsageGet200ResponseBuilder();
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
