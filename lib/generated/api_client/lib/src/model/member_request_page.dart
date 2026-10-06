//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:built_collection/built_collection.dart';
import 'package:lythaus_api_client/src/model/member_support_request.dart';
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'member_request_page.g.dart';

/// MemberRequestPage
///
/// Properties:
/// * [items]
/// * [nextCursor]
/// * [snapshotAt]
@BuiltValue()
abstract class MemberRequestPage implements Built<MemberRequestPage, MemberRequestPageBuilder> {
  @BuiltValueField(wireName: r'items')
  BuiltList<MemberSupportRequest> get items;

  @BuiltValueField(wireName: r'nextCursor')
  String? get nextCursor;

  @BuiltValueField(wireName: r'snapshotAt')
  DateTime get snapshotAt;

  MemberRequestPage._();

  factory MemberRequestPage([void updates(MemberRequestPageBuilder b)]) = _$MemberRequestPage;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(MemberRequestPageBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<MemberRequestPage> get serializer => _$MemberRequestPageSerializer();
}

class _$MemberRequestPageSerializer implements PrimitiveSerializer<MemberRequestPage> {
  @override
  final Iterable<Type> types = const [MemberRequestPage, _$MemberRequestPage];

  @override
  final String wireName = r'MemberRequestPage';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    MemberRequestPage object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    yield r'items';
    yield serializers.serialize(
      object.items,
      specifiedType: const FullType(BuiltList, [FullType(MemberSupportRequest)]),
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
    MemberRequestPage object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required MemberRequestPageBuilder result,
    required List<Object?> unhandled,
  }) {
    for (var i = 0; i < serializedList.length; i += 2) {
      final key = serializedList[i] as String;
      final value = serializedList[i + 1];
      switch (key) {
        case r'items':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(BuiltList, [FullType(MemberSupportRequest)]),
          ) as BuiltList<MemberSupportRequest>;
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
  MemberRequestPage deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = MemberRequestPageBuilder();
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
