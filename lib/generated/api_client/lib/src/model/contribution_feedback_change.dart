//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:built_collection/built_collection.dart';
import 'package:lythaus_api_client/src/model/contribution_feedback_target.dart';
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'contribution_feedback_change.g.dart';

/// ContributionFeedbackChange
///
/// Properties:
/// * [target]
/// * [channel]
/// * [value]
/// * [changed]
@BuiltValue()
abstract class ContributionFeedbackChange implements Built<ContributionFeedbackChange, ContributionFeedbackChangeBuilder> {
  @BuiltValueField(wireName: r'target')
  ContributionFeedbackTarget get target;

  @BuiltValueField(wireName: r'channel')
  ContributionFeedbackChangeChannelEnum get channel;
  // enum channelEnum {  quality,  emotion,  };

  @BuiltValueField(wireName: r'value')
  ContributionFeedbackChangeValueEnum? get value;
  // enum valueEnum {  like,  dislike,  amused,  sad,  angry,  surprised,  appreciative,  };

  @BuiltValueField(wireName: r'changed')
  bool get changed;

  ContributionFeedbackChange._();

  factory ContributionFeedbackChange([void updates(ContributionFeedbackChangeBuilder b)]) = _$ContributionFeedbackChange;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(ContributionFeedbackChangeBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<ContributionFeedbackChange> get serializer => _$ContributionFeedbackChangeSerializer();
}

class _$ContributionFeedbackChangeSerializer implements PrimitiveSerializer<ContributionFeedbackChange> {
  @override
  final Iterable<Type> types = const [ContributionFeedbackChange, _$ContributionFeedbackChange];

  @override
  final String wireName = r'ContributionFeedbackChange';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    ContributionFeedbackChange object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    yield r'target';
    yield serializers.serialize(
      object.target,
      specifiedType: const FullType(ContributionFeedbackTarget),
    );
    yield r'channel';
    yield serializers.serialize(
      object.channel,
      specifiedType: const FullType(ContributionFeedbackChangeChannelEnum),
    );
    yield r'value';
    yield object.value == null ? null : serializers.serialize(
      object.value,
      specifiedType: const FullType.nullable(ContributionFeedbackChangeValueEnum),
    );
    yield r'changed';
    yield serializers.serialize(
      object.changed,
      specifiedType: const FullType(bool),
    );
  }

  @override
  Object serialize(
    Serializers serializers,
    ContributionFeedbackChange object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required ContributionFeedbackChangeBuilder result,
    required List<Object?> unhandled,
  }) {
    for (var i = 0; i < serializedList.length; i += 2) {
      final key = serializedList[i] as String;
      final value = serializedList[i + 1];
      switch (key) {
        case r'target':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(ContributionFeedbackTarget),
          ) as ContributionFeedbackTarget;
          result.target.replace(valueDes);
          break;
        case r'channel':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(ContributionFeedbackChangeChannelEnum),
          ) as ContributionFeedbackChangeChannelEnum;
          result.channel = valueDes;
          break;
        case r'value':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType.nullable(ContributionFeedbackChangeValueEnum),
          ) as ContributionFeedbackChangeValueEnum?;
          if (valueDes == null) continue;
          result.value = valueDes;
          break;
        case r'changed':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(bool),
          ) as bool;
          result.changed = valueDes;
          break;
        default:
          unhandled.add(key);
          unhandled.add(value);
          break;
      }
    }
  }

  @override
  ContributionFeedbackChange deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = ContributionFeedbackChangeBuilder();
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

class ContributionFeedbackChangeChannelEnum extends EnumClass {

  @BuiltValueEnumConst(wireName: r'quality')
  static const ContributionFeedbackChangeChannelEnum quality = _$contributionFeedbackChangeChannelEnum_quality;
  @BuiltValueEnumConst(wireName: r'emotion')
  static const ContributionFeedbackChangeChannelEnum emotion = _$contributionFeedbackChangeChannelEnum_emotion;

  static Serializer<ContributionFeedbackChangeChannelEnum> get serializer => _$contributionFeedbackChangeChannelEnumSerializer;

  const ContributionFeedbackChangeChannelEnum._(String name): super(name);

  static BuiltSet<ContributionFeedbackChangeChannelEnum> get values => _$contributionFeedbackChangeChannelEnumValues;
  static ContributionFeedbackChangeChannelEnum valueOf(String name) => _$contributionFeedbackChangeChannelEnumValueOf(name);
}

class ContributionFeedbackChangeValueEnum extends EnumClass {

  @BuiltValueEnumConst(wireName: r'like')
  static const ContributionFeedbackChangeValueEnum like = _$contributionFeedbackChangeValueEnum_like;
  @BuiltValueEnumConst(wireName: r'dislike')
  static const ContributionFeedbackChangeValueEnum dislike = _$contributionFeedbackChangeValueEnum_dislike;
  @BuiltValueEnumConst(wireName: r'amused')
  static const ContributionFeedbackChangeValueEnum amused = _$contributionFeedbackChangeValueEnum_amused;
  @BuiltValueEnumConst(wireName: r'sad')
  static const ContributionFeedbackChangeValueEnum sad = _$contributionFeedbackChangeValueEnum_sad;
  @BuiltValueEnumConst(wireName: r'angry')
  static const ContributionFeedbackChangeValueEnum angry = _$contributionFeedbackChangeValueEnum_angry;
  @BuiltValueEnumConst(wireName: r'surprised')
  static const ContributionFeedbackChangeValueEnum surprised = _$contributionFeedbackChangeValueEnum_surprised;
  @BuiltValueEnumConst(wireName: r'appreciative')
  static const ContributionFeedbackChangeValueEnum appreciative = _$contributionFeedbackChangeValueEnum_appreciative;

  static Serializer<ContributionFeedbackChangeValueEnum> get serializer => _$contributionFeedbackChangeValueEnumSerializer;

  const ContributionFeedbackChangeValueEnum._(String name): super(name);

  static BuiltSet<ContributionFeedbackChangeValueEnum> get values => _$contributionFeedbackChangeValueEnumValues;
  static ContributionFeedbackChangeValueEnum valueOf(String name) => _$contributionFeedbackChangeValueEnumValueOf(name);
}
