//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:lythaus_api_client/src/model/waitlist_admin_response_summary.dart';
import 'package:built_collection/built_collection.dart';
import 'package:lythaus_api_client/src/model/waitlist_admin_item.dart';
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'waitlist_admin_response.g.dart';

/// WaitlistAdminResponse
///
/// Properties:
/// * [items]
/// * [nextCursor]
/// * [summary]
@BuiltValue()
abstract class WaitlistAdminResponse implements Built<WaitlistAdminResponse, WaitlistAdminResponseBuilder> {
  @BuiltValueField(wireName: r'items')
  BuiltList<WaitlistAdminItem> get items;

  @BuiltValueField(wireName: r'nextCursor')
  String? get nextCursor;

  @BuiltValueField(wireName: r'summary')
  WaitlistAdminResponseSummary get summary;

  WaitlistAdminResponse._();

  factory WaitlistAdminResponse([void updates(WaitlistAdminResponseBuilder b)]) = _$WaitlistAdminResponse;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(WaitlistAdminResponseBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<WaitlistAdminResponse> get serializer => _$WaitlistAdminResponseSerializer();
}

class _$WaitlistAdminResponseSerializer implements PrimitiveSerializer<WaitlistAdminResponse> {
  @override
  final Iterable<Type> types = const [WaitlistAdminResponse, _$WaitlistAdminResponse];

  @override
  final String wireName = r'WaitlistAdminResponse';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    WaitlistAdminResponse object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    yield r'items';
    yield serializers.serialize(
      object.items,
      specifiedType: const FullType(BuiltList, [FullType(WaitlistAdminItem)]),
    );
    yield r'nextCursor';
    yield object.nextCursor == null ? null : serializers.serialize(
      object.nextCursor,
      specifiedType: const FullType.nullable(String),
    );
    yield r'summary';
    yield serializers.serialize(
      object.summary,
      specifiedType: const FullType(WaitlistAdminResponseSummary),
    );
  }

  @override
  Object serialize(
    Serializers serializers,
    WaitlistAdminResponse object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required WaitlistAdminResponseBuilder result,
    required List<Object?> unhandled,
  }) {
    for (var i = 0; i < serializedList.length; i += 2) {
      final key = serializedList[i] as String;
      final value = serializedList[i + 1];
      switch (key) {
        case r'items':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(BuiltList, [FullType(WaitlistAdminItem)]),
          ) as BuiltList<WaitlistAdminItem>;
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
        case r'summary':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(WaitlistAdminResponseSummary),
          ) as WaitlistAdminResponseSummary;
          result.summary.replace(valueDes);
          break;
        default:
          unhandled.add(key);
          unhandled.add(value);
          break;
      }
    }
  }

  @override
  WaitlistAdminResponse deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = WaitlistAdminResponseBuilder();
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
