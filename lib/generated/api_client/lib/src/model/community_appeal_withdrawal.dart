//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:built_collection/built_collection.dart';
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'community_appeal_withdrawal.g.dart';

/// CommunityAppealWithdrawal
///
/// Properties:
/// * [appealId]
/// * [state]
@BuiltValue()
abstract class CommunityAppealWithdrawal implements Built<CommunityAppealWithdrawal, CommunityAppealWithdrawalBuilder> {
  @BuiltValueField(wireName: r'appealId')
  String get appealId;

  @BuiltValueField(wireName: r'state')
  CommunityAppealWithdrawalStateEnum get state;
  // enum stateEnum {  withdrawn,  };

  CommunityAppealWithdrawal._();

  factory CommunityAppealWithdrawal([void updates(CommunityAppealWithdrawalBuilder b)]) = _$CommunityAppealWithdrawal;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(CommunityAppealWithdrawalBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<CommunityAppealWithdrawal> get serializer => _$CommunityAppealWithdrawalSerializer();
}

class _$CommunityAppealWithdrawalSerializer implements PrimitiveSerializer<CommunityAppealWithdrawal> {
  @override
  final Iterable<Type> types = const [CommunityAppealWithdrawal, _$CommunityAppealWithdrawal];

  @override
  final String wireName = r'CommunityAppealWithdrawal';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    CommunityAppealWithdrawal object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    yield r'appealId';
    yield serializers.serialize(
      object.appealId,
      specifiedType: const FullType(String),
    );
    yield r'state';
    yield serializers.serialize(
      object.state,
      specifiedType: const FullType(CommunityAppealWithdrawalStateEnum),
    );
  }

  @override
  Object serialize(
    Serializers serializers,
    CommunityAppealWithdrawal object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required CommunityAppealWithdrawalBuilder result,
    required List<Object?> unhandled,
  }) {
    for (var i = 0; i < serializedList.length; i += 2) {
      final key = serializedList[i] as String;
      final value = serializedList[i + 1];
      switch (key) {
        case r'appealId':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.appealId = valueDes;
          break;
        case r'state':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(CommunityAppealWithdrawalStateEnum),
          ) as CommunityAppealWithdrawalStateEnum;
          result.state = valueDes;
          break;
        default:
          unhandled.add(key);
          unhandled.add(value);
          break;
      }
    }
  }

  @override
  CommunityAppealWithdrawal deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = CommunityAppealWithdrawalBuilder();
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

class CommunityAppealWithdrawalStateEnum extends EnumClass {

  @BuiltValueEnumConst(wireName: r'withdrawn')
  static const CommunityAppealWithdrawalStateEnum withdrawn = _$communityAppealWithdrawalStateEnum_withdrawn;

  static Serializer<CommunityAppealWithdrawalStateEnum> get serializer => _$communityAppealWithdrawalStateEnumSerializer;

  const CommunityAppealWithdrawalStateEnum._(String name): super(name);

  static BuiltSet<CommunityAppealWithdrawalStateEnum> get values => _$communityAppealWithdrawalStateEnumValues;
  static CommunityAppealWithdrawalStateEnum valueOf(String name) => _$communityAppealWithdrawalStateEnumValueOf(name);
}
