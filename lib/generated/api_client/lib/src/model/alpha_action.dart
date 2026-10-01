//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:built_collection/built_collection.dart';
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'alpha_action.g.dart';

/// AlphaAction
///
/// Properties:
/// * [caseId]
/// * [status]
/// * [accepted]
/// * [purgeStatus]
/// * [adviser]
/// * [publicationEligible]
/// * [rewardsEligible]
@BuiltValue()
abstract class AlphaAction implements Built<AlphaAction, AlphaActionBuilder> {
  @BuiltValueField(wireName: r'caseId')
  String? get caseId;

  @BuiltValueField(wireName: r'status')
  String? get status;

  @BuiltValueField(wireName: r'accepted')
  bool? get accepted;

  @BuiltValueField(wireName: r'purgeStatus')
  AlphaActionPurgeStatusEnum? get purgeStatus;
  // enum purgeStatusEnum {  completed,  pending,  blocked,  };

  @BuiltValueField(wireName: r'adviser')
  AlphaActionAdviserEnum? get adviser;
  // enum adviserEnum {  GPT_OSS_PRIVATE_ALPHA_EXPLAINER,  };

  @BuiltValueField(wireName: r'publicationEligible')
  bool? get publicationEligible;

  @BuiltValueField(wireName: r'rewardsEligible')
  bool? get rewardsEligible;

  AlphaAction._();

  factory AlphaAction([void updates(AlphaActionBuilder b)]) = _$AlphaAction;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(AlphaActionBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<AlphaAction> get serializer => _$AlphaActionSerializer();
}

class _$AlphaActionSerializer implements PrimitiveSerializer<AlphaAction> {
  @override
  final Iterable<Type> types = const [AlphaAction, _$AlphaAction];

  @override
  final String wireName = r'AlphaAction';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    AlphaAction object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    if (object.caseId != null) {
      yield r'caseId';
      yield serializers.serialize(
        object.caseId,
        specifiedType: const FullType(String),
      );
    }
    if (object.status != null) {
      yield r'status';
      yield serializers.serialize(
        object.status,
        specifiedType: const FullType(String),
      );
    }
    if (object.accepted != null) {
      yield r'accepted';
      yield serializers.serialize(
        object.accepted,
        specifiedType: const FullType(bool),
      );
    }
    if (object.purgeStatus != null) {
      yield r'purgeStatus';
      yield serializers.serialize(
        object.purgeStatus,
        specifiedType: const FullType(AlphaActionPurgeStatusEnum),
      );
    }
    if (object.adviser != null) {
      yield r'adviser';
      yield serializers.serialize(
        object.adviser,
        specifiedType: const FullType(AlphaActionAdviserEnum),
      );
    }
    if (object.publicationEligible != null) {
      yield r'publicationEligible';
      yield serializers.serialize(
        object.publicationEligible,
        specifiedType: const FullType(bool),
      );
    }
    if (object.rewardsEligible != null) {
      yield r'rewardsEligible';
      yield serializers.serialize(
        object.rewardsEligible,
        specifiedType: const FullType(bool),
      );
    }
  }

  @override
  Object serialize(
    Serializers serializers,
    AlphaAction object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required AlphaActionBuilder result,
    required List<Object?> unhandled,
  }) {
    for (var i = 0; i < serializedList.length; i += 2) {
      final key = serializedList[i] as String;
      final value = serializedList[i + 1];
      switch (key) {
        case r'caseId':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.caseId = valueDes;
          break;
        case r'status':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.status = valueDes;
          break;
        case r'accepted':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(bool),
          ) as bool;
          result.accepted = valueDes;
          break;
        case r'purgeStatus':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(AlphaActionPurgeStatusEnum),
          ) as AlphaActionPurgeStatusEnum;
          result.purgeStatus = valueDes;
          break;
        case r'adviser':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(AlphaActionAdviserEnum),
          ) as AlphaActionAdviserEnum;
          result.adviser = valueDes;
          break;
        case r'publicationEligible':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(bool),
          ) as bool;
          result.publicationEligible = valueDes;
          break;
        case r'rewardsEligible':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(bool),
          ) as bool;
          result.rewardsEligible = valueDes;
          break;
        default:
          unhandled.add(key);
          unhandled.add(value);
          break;
      }
    }
  }

  @override
  AlphaAction deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = AlphaActionBuilder();
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

class AlphaActionPurgeStatusEnum extends EnumClass {

  @BuiltValueEnumConst(wireName: r'completed')
  static const AlphaActionPurgeStatusEnum completed = _$alphaActionPurgeStatusEnum_completed;
  @BuiltValueEnumConst(wireName: r'pending')
  static const AlphaActionPurgeStatusEnum pending = _$alphaActionPurgeStatusEnum_pending;
  @BuiltValueEnumConst(wireName: r'blocked')
  static const AlphaActionPurgeStatusEnum blocked = _$alphaActionPurgeStatusEnum_blocked;

  static Serializer<AlphaActionPurgeStatusEnum> get serializer => _$alphaActionPurgeStatusEnumSerializer;

  const AlphaActionPurgeStatusEnum._(String name): super(name);

  static BuiltSet<AlphaActionPurgeStatusEnum> get values => _$alphaActionPurgeStatusEnumValues;
  static AlphaActionPurgeStatusEnum valueOf(String name) => _$alphaActionPurgeStatusEnumValueOf(name);
}

class AlphaActionAdviserEnum extends EnumClass {

  @BuiltValueEnumConst(wireName: r'GPT_OSS_PRIVATE_ALPHA_EXPLAINER')
  static const AlphaActionAdviserEnum GPT_OSS_PRIVATE_ALPHA_EXPLAINER = _$alphaActionAdviserEnum_GPT_OSS_PRIVATE_ALPHA_EXPLAINER;

  static Serializer<AlphaActionAdviserEnum> get serializer => _$alphaActionAdviserEnumSerializer;

  const AlphaActionAdviserEnum._(String name): super(name);

  static BuiltSet<AlphaActionAdviserEnum> get values => _$alphaActionAdviserEnumValues;
  static AlphaActionAdviserEnum valueOf(String name) => _$alphaActionAdviserEnumValueOf(name);
}
