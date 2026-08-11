//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'storage_usage_get200_response_storage.g.dart';

/// StorageUsageGet200ResponseStorage
///
/// Properties:
/// * [bytesReserved]
/// * [bytesUploaded]
/// * [bytesApproved]
/// * [bytesRejected]
/// * [bytesExports]
/// * [objectCount]
/// * [lastReconciledAt]
@BuiltValue()
abstract class StorageUsageGet200ResponseStorage implements Built<StorageUsageGet200ResponseStorage, StorageUsageGet200ResponseStorageBuilder> {
  @BuiltValueField(wireName: r'bytes_reserved')
  int get bytesReserved;

  @BuiltValueField(wireName: r'bytes_uploaded')
  int get bytesUploaded;

  @BuiltValueField(wireName: r'bytes_approved')
  int get bytesApproved;

  @BuiltValueField(wireName: r'bytes_rejected')
  int get bytesRejected;

  @BuiltValueField(wireName: r'bytes_exports')
  int get bytesExports;

  @BuiltValueField(wireName: r'object_count')
  int get objectCount;

  @BuiltValueField(wireName: r'last_reconciled_at')
  DateTime? get lastReconciledAt;

  StorageUsageGet200ResponseStorage._();

  factory StorageUsageGet200ResponseStorage([void updates(StorageUsageGet200ResponseStorageBuilder b)]) = _$StorageUsageGet200ResponseStorage;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(StorageUsageGet200ResponseStorageBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<StorageUsageGet200ResponseStorage> get serializer => _$StorageUsageGet200ResponseStorageSerializer();
}

class _$StorageUsageGet200ResponseStorageSerializer implements PrimitiveSerializer<StorageUsageGet200ResponseStorage> {
  @override
  final Iterable<Type> types = const [StorageUsageGet200ResponseStorage, _$StorageUsageGet200ResponseStorage];

  @override
  final String wireName = r'StorageUsageGet200ResponseStorage';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    StorageUsageGet200ResponseStorage object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    yield r'bytes_reserved';
    yield serializers.serialize(
      object.bytesReserved,
      specifiedType: const FullType(int),
    );
    yield r'bytes_uploaded';
    yield serializers.serialize(
      object.bytesUploaded,
      specifiedType: const FullType(int),
    );
    yield r'bytes_approved';
    yield serializers.serialize(
      object.bytesApproved,
      specifiedType: const FullType(int),
    );
    yield r'bytes_rejected';
    yield serializers.serialize(
      object.bytesRejected,
      specifiedType: const FullType(int),
    );
    yield r'bytes_exports';
    yield serializers.serialize(
      object.bytesExports,
      specifiedType: const FullType(int),
    );
    yield r'object_count';
    yield serializers.serialize(
      object.objectCount,
      specifiedType: const FullType(int),
    );
    if (object.lastReconciledAt != null) {
      yield r'last_reconciled_at';
      yield serializers.serialize(
        object.lastReconciledAt,
        specifiedType: const FullType.nullable(DateTime),
      );
    }
  }

  @override
  Object serialize(
    Serializers serializers,
    StorageUsageGet200ResponseStorage object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required StorageUsageGet200ResponseStorageBuilder result,
    required List<Object?> unhandled,
  }) {
    for (var i = 0; i < serializedList.length; i += 2) {
      final key = serializedList[i] as String;
      final value = serializedList[i + 1];
      switch (key) {
        case r'bytes_reserved':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(int),
          ) as int;
          result.bytesReserved = valueDes;
          break;
        case r'bytes_uploaded':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(int),
          ) as int;
          result.bytesUploaded = valueDes;
          break;
        case r'bytes_approved':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(int),
          ) as int;
          result.bytesApproved = valueDes;
          break;
        case r'bytes_rejected':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(int),
          ) as int;
          result.bytesRejected = valueDes;
          break;
        case r'bytes_exports':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(int),
          ) as int;
          result.bytesExports = valueDes;
          break;
        case r'object_count':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(int),
          ) as int;
          result.objectCount = valueDes;
          break;
        case r'last_reconciled_at':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType.nullable(DateTime),
          ) as DateTime?;
          if (valueDes == null) continue;
          result.lastReconciledAt = valueDes;
          break;
        default:
          unhandled.add(key);
          unhandled.add(value);
          break;
      }
    }
  }

  @override
  StorageUsageGet200ResponseStorage deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = StorageUsageGet200ResponseStorageBuilder();
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
