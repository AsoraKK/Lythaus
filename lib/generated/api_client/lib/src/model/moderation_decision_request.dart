//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:built_collection/built_collection.dart';
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'moderation_decision_request.g.dart';

/// ModerationDecisionRequest
///
/// Properties:
/// * [outcome]
/// * [reasonCode]
/// * [publicLabel] - Public categorical label. AI-generated content cannot be allowed for publication.
@BuiltValue()
abstract class ModerationDecisionRequest implements Built<ModerationDecisionRequest, ModerationDecisionRequestBuilder> {
  @BuiltValueField(wireName: r'outcome')
  ModerationDecisionRequestOutcomeEnum get outcome;
  // enum outcomeEnum {  allow,  block,  queue,  };

  @BuiltValueField(wireName: r'reasonCode')
  String get reasonCode;

  /// Public categorical label. AI-generated content cannot be allowed for publication.
  @BuiltValueField(wireName: r'publicLabel')
  ModerationDecisionRequestPublicLabelEnum? get publicLabel;
  // enum publicLabelEnum {  Human-authored,  AI-assisted,  Under review,  };

  ModerationDecisionRequest._();

  factory ModerationDecisionRequest([void updates(ModerationDecisionRequestBuilder b)]) = _$ModerationDecisionRequest;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(ModerationDecisionRequestBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<ModerationDecisionRequest> get serializer => _$ModerationDecisionRequestSerializer();
}

class _$ModerationDecisionRequestSerializer implements PrimitiveSerializer<ModerationDecisionRequest> {
  @override
  final Iterable<Type> types = const [ModerationDecisionRequest, _$ModerationDecisionRequest];

  @override
  final String wireName = r'ModerationDecisionRequest';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    ModerationDecisionRequest object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    yield r'outcome';
    yield serializers.serialize(
      object.outcome,
      specifiedType: const FullType(ModerationDecisionRequestOutcomeEnum),
    );
    yield r'reasonCode';
    yield serializers.serialize(
      object.reasonCode,
      specifiedType: const FullType(String),
    );
    if (object.publicLabel != null) {
      yield r'publicLabel';
      yield serializers.serialize(
        object.publicLabel,
        specifiedType: const FullType(ModerationDecisionRequestPublicLabelEnum),
      );
    }
  }

  @override
  Object serialize(
    Serializers serializers,
    ModerationDecisionRequest object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required ModerationDecisionRequestBuilder result,
    required List<Object?> unhandled,
  }) {
    for (var i = 0; i < serializedList.length; i += 2) {
      final key = serializedList[i] as String;
      final value = serializedList[i + 1];
      switch (key) {
        case r'outcome':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(ModerationDecisionRequestOutcomeEnum),
          ) as ModerationDecisionRequestOutcomeEnum;
          result.outcome = valueDes;
          break;
        case r'reasonCode':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.reasonCode = valueDes;
          break;
        case r'publicLabel':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(ModerationDecisionRequestPublicLabelEnum),
          ) as ModerationDecisionRequestPublicLabelEnum;
          result.publicLabel = valueDes;
          break;
        default:
          unhandled.add(key);
          unhandled.add(value);
          break;
      }
    }
  }

  @override
  ModerationDecisionRequest deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = ModerationDecisionRequestBuilder();
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

class ModerationDecisionRequestOutcomeEnum extends EnumClass {

  @BuiltValueEnumConst(wireName: r'allow')
  static const ModerationDecisionRequestOutcomeEnum allow = _$moderationDecisionRequestOutcomeEnum_allow;
  @BuiltValueEnumConst(wireName: r'block')
  static const ModerationDecisionRequestOutcomeEnum block = _$moderationDecisionRequestOutcomeEnum_block;
  @BuiltValueEnumConst(wireName: r'queue')
  static const ModerationDecisionRequestOutcomeEnum queue = _$moderationDecisionRequestOutcomeEnum_queue;

  static Serializer<ModerationDecisionRequestOutcomeEnum> get serializer => _$moderationDecisionRequestOutcomeEnumSerializer;

  const ModerationDecisionRequestOutcomeEnum._(String name): super(name);

  static BuiltSet<ModerationDecisionRequestOutcomeEnum> get values => _$moderationDecisionRequestOutcomeEnumValues;
  static ModerationDecisionRequestOutcomeEnum valueOf(String name) => _$moderationDecisionRequestOutcomeEnumValueOf(name);
}

class ModerationDecisionRequestPublicLabelEnum extends EnumClass {

  /// Public categorical label. AI-generated content cannot be allowed for publication.
  @BuiltValueEnumConst(wireName: r'Human-authored')
  static const ModerationDecisionRequestPublicLabelEnum humanAuthored = _$moderationDecisionRequestPublicLabelEnum_humanAuthored;
  /// Public categorical label. AI-generated content cannot be allowed for publication.
  @BuiltValueEnumConst(wireName: r'AI-assisted')
  static const ModerationDecisionRequestPublicLabelEnum aIAssisted = _$moderationDecisionRequestPublicLabelEnum_aIAssisted;
  /// Public categorical label. AI-generated content cannot be allowed for publication.
  @BuiltValueEnumConst(wireName: r'Under review')
  static const ModerationDecisionRequestPublicLabelEnum underReview = _$moderationDecisionRequestPublicLabelEnum_underReview;

  static Serializer<ModerationDecisionRequestPublicLabelEnum> get serializer => _$moderationDecisionRequestPublicLabelEnumSerializer;

  const ModerationDecisionRequestPublicLabelEnum._(String name): super(name);

  static BuiltSet<ModerationDecisionRequestPublicLabelEnum> get values => _$moderationDecisionRequestPublicLabelEnumValues;
  static ModerationDecisionRequestPublicLabelEnum valueOf(String name) => _$moderationDecisionRequestPublicLabelEnumValueOf(name);
}
