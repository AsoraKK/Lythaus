//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:lythaus_api_client/src/model/community_appeal_detail.dart';
import 'package:built_collection/built_collection.dart';
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'community_appeal_queue.g.dart';

/// CommunityAppealQueue
///
/// Properties:
/// * [state]
/// * [items]
@BuiltValue()
abstract class CommunityAppealQueue implements Built<CommunityAppealQueue, CommunityAppealQueueBuilder> {
  @BuiltValueField(wireName: r'state')
  CommunityAppealQueueStateEnum get state;
  // enum stateEnum {  available,  no_case_available,  };

  @BuiltValueField(wireName: r'items')
  BuiltList<CommunityAppealDetail> get items;

  CommunityAppealQueue._();

  factory CommunityAppealQueue([void updates(CommunityAppealQueueBuilder b)]) = _$CommunityAppealQueue;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(CommunityAppealQueueBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<CommunityAppealQueue> get serializer => _$CommunityAppealQueueSerializer();
}

class _$CommunityAppealQueueSerializer implements PrimitiveSerializer<CommunityAppealQueue> {
  @override
  final Iterable<Type> types = const [CommunityAppealQueue, _$CommunityAppealQueue];

  @override
  final String wireName = r'CommunityAppealQueue';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    CommunityAppealQueue object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    yield r'state';
    yield serializers.serialize(
      object.state,
      specifiedType: const FullType(CommunityAppealQueueStateEnum),
    );
    yield r'items';
    yield serializers.serialize(
      object.items,
      specifiedType: const FullType(BuiltList, [FullType(CommunityAppealDetail)]),
    );
  }

  @override
  Object serialize(
    Serializers serializers,
    CommunityAppealQueue object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required CommunityAppealQueueBuilder result,
    required List<Object?> unhandled,
  }) {
    for (var i = 0; i < serializedList.length; i += 2) {
      final key = serializedList[i] as String;
      final value = serializedList[i + 1];
      switch (key) {
        case r'state':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(CommunityAppealQueueStateEnum),
          ) as CommunityAppealQueueStateEnum;
          result.state = valueDes;
          break;
        case r'items':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(BuiltList, [FullType(CommunityAppealDetail)]),
          ) as BuiltList<CommunityAppealDetail>;
          result.items.replace(valueDes);
          break;
        default:
          unhandled.add(key);
          unhandled.add(value);
          break;
      }
    }
  }

  @override
  CommunityAppealQueue deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = CommunityAppealQueueBuilder();
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

class CommunityAppealQueueStateEnum extends EnumClass {

  @BuiltValueEnumConst(wireName: r'available')
  static const CommunityAppealQueueStateEnum available = _$communityAppealQueueStateEnum_available;
  @BuiltValueEnumConst(wireName: r'no_case_available')
  static const CommunityAppealQueueStateEnum noCaseAvailable = _$communityAppealQueueStateEnum_noCaseAvailable;

  static Serializer<CommunityAppealQueueStateEnum> get serializer => _$communityAppealQueueStateEnumSerializer;

  const CommunityAppealQueueStateEnum._(String name): super(name);

  static BuiltSet<CommunityAppealQueueStateEnum> get values => _$communityAppealQueueStateEnumValues;
  static CommunityAppealQueueStateEnum valueOf(String name) => _$communityAppealQueueStateEnumValueOf(name);
}
