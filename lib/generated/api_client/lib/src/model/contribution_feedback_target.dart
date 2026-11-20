//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:built_collection/built_collection.dart';
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'contribution_feedback_target.g.dart';

/// ContributionFeedbackTarget
///
/// Properties:
/// * [type]
/// * [id]
@BuiltValue()
abstract class ContributionFeedbackTarget implements Built<ContributionFeedbackTarget, ContributionFeedbackTargetBuilder> {
  @BuiltValueField(wireName: r'type')
  ContributionFeedbackTargetTypeEnum get type;
  // enum typeEnum {  post,  comment,  };

  @BuiltValueField(wireName: r'id')
  String get id;

  ContributionFeedbackTarget._();

  factory ContributionFeedbackTarget([void updates(ContributionFeedbackTargetBuilder b)]) = _$ContributionFeedbackTarget;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(ContributionFeedbackTargetBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<ContributionFeedbackTarget> get serializer => _$ContributionFeedbackTargetSerializer();
}

class _$ContributionFeedbackTargetSerializer implements PrimitiveSerializer<ContributionFeedbackTarget> {
  @override
  final Iterable<Type> types = const [ContributionFeedbackTarget, _$ContributionFeedbackTarget];

  @override
  final String wireName = r'ContributionFeedbackTarget';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    ContributionFeedbackTarget object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    yield r'type';
    yield serializers.serialize(
      object.type,
      specifiedType: const FullType(ContributionFeedbackTargetTypeEnum),
    );
    yield r'id';
    yield serializers.serialize(
      object.id,
      specifiedType: const FullType(String),
    );
  }

  @override
  Object serialize(
    Serializers serializers,
    ContributionFeedbackTarget object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required ContributionFeedbackTargetBuilder result,
    required List<Object?> unhandled,
  }) {
    for (var i = 0; i < serializedList.length; i += 2) {
      final key = serializedList[i] as String;
      final value = serializedList[i + 1];
      switch (key) {
        case r'type':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(ContributionFeedbackTargetTypeEnum),
          ) as ContributionFeedbackTargetTypeEnum;
          result.type = valueDes;
          break;
        case r'id':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.id = valueDes;
          break;
        default:
          unhandled.add(key);
          unhandled.add(value);
          break;
      }
    }
  }

  @override
  ContributionFeedbackTarget deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = ContributionFeedbackTargetBuilder();
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

class ContributionFeedbackTargetTypeEnum extends EnumClass {

  @BuiltValueEnumConst(wireName: r'post')
  static const ContributionFeedbackTargetTypeEnum post = _$contributionFeedbackTargetTypeEnum_post;
  @BuiltValueEnumConst(wireName: r'comment')
  static const ContributionFeedbackTargetTypeEnum comment = _$contributionFeedbackTargetTypeEnum_comment;

  static Serializer<ContributionFeedbackTargetTypeEnum> get serializer => _$contributionFeedbackTargetTypeEnumSerializer;

  const ContributionFeedbackTargetTypeEnum._(String name): super(name);

  static BuiltSet<ContributionFeedbackTargetTypeEnum> get values => _$contributionFeedbackTargetTypeEnumValues;
  static ContributionFeedbackTargetTypeEnum valueOf(String name) => _$contributionFeedbackTargetTypeEnumValueOf(name);
}
