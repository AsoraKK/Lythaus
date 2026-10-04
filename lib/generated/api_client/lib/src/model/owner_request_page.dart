//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:lythaus_api_client/src/model/owner_support_request.dart';
import 'package:built_collection/built_collection.dart';
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'owner_request_page.g.dart';

/// OwnerRequestPage
///
/// Properties:
/// * [items]
/// * [nextCursor]
/// * [snapshotAt]
@BuiltValue()
abstract class OwnerRequestPage implements Built<OwnerRequestPage, OwnerRequestPageBuilder> {
  @BuiltValueField(wireName: r'items')
  BuiltList<OwnerSupportRequest> get items;

  @BuiltValueField(wireName: r'nextCursor')
  String? get nextCursor;

  @BuiltValueField(wireName: r'snapshotAt')
  DateTime get snapshotAt;

  OwnerRequestPage._();

  factory OwnerRequestPage([void updates(OwnerRequestPageBuilder b)]) = _$OwnerRequestPage;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(OwnerRequestPageBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<OwnerRequestPage> get serializer => _$OwnerRequestPageSerializer();
}

class _$OwnerRequestPageSerializer implements PrimitiveSerializer<OwnerRequestPage> {
  @override
  final Iterable<Type> types = const [OwnerRequestPage, _$OwnerRequestPage];

  @override
  final String wireName = r'OwnerRequestPage';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    OwnerRequestPage object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    yield r'items';
    yield serializers.serialize(
      object.items,
      specifiedType: const FullType(BuiltList, [FullType(OwnerSupportRequest)]),
    );
    yield r'nextCursor';
    yield object.nextCursor == null ? null : serializers.serialize(
      object.nextCursor,
      specifiedType: const FullType.nullable(String),
    );
    yield r'snapshotAt';
    yield serializers.serialize(
      object.snapshotAt,
      specifiedType: const FullType(DateTime),
    );
  }

  @override
  Object serialize(
    Serializers serializers,
    OwnerRequestPage object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required OwnerRequestPageBuilder result,
    required List<Object?> unhandled,
  }) {
    for (var i = 0; i < serializedList.length; i += 2) {
      final key = serializedList[i] as String;
      final value = serializedList[i + 1];
      switch (key) {
        case r'items':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(BuiltList, [FullType(OwnerSupportRequest)]),
          ) as BuiltList<OwnerSupportRequest>;
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
        case r'snapshotAt':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(DateTime),
          ) as DateTime;
          result.snapshotAt = valueDes;
          break;
        default:
          unhandled.add(key);
          unhandled.add(value);
          break;
      }
    }
  }

  @override
  OwnerRequestPage deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = OwnerRequestPageBuilder();
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
