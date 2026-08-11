//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:built_collection/built_collection.dart';
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'appeal_reviewer_assignments_items_inner.g.dart';

/// AppealReviewerAssignmentsItemsInner
///
/// Properties:
/// * [id]
/// * [appealId]
/// * [state]
/// * [assignedAt]
/// * [riskClass]
/// * [expiresAt]
/// * [policyVersion]
/// * [decision]
/// * [lockedAt]
@BuiltValue()
abstract class AppealReviewerAssignmentsItemsInner implements Built<AppealReviewerAssignmentsItemsInner, AppealReviewerAssignmentsItemsInnerBuilder> {
  @BuiltValueField(wireName: r'id')
  String get id;

  @BuiltValueField(wireName: r'appeal_id')
  String get appealId;

  @BuiltValueField(wireName: r'state')
  AppealReviewerAssignmentsItemsInnerStateEnum get state;
  // enum stateEnum {  assigned,  recused,  voted,  replaced,  expired,  };

  @BuiltValueField(wireName: r'assigned_at')
  DateTime get assignedAt;

  @BuiltValueField(wireName: r'risk_class')
  AppealReviewerAssignmentsItemsInnerRiskClassEnum get riskClass;
  // enum riskClassEnum {  standard,  high,  };

  @BuiltValueField(wireName: r'expires_at')
  DateTime get expiresAt;

  @BuiltValueField(wireName: r'policy_version')
  String get policyVersion;

  @BuiltValueField(wireName: r'decision')
  AppealReviewerAssignmentsItemsInnerDecisionEnum? get decision;
  // enum decisionEnum {  overturn,  uphold,  };

  @BuiltValueField(wireName: r'locked_at')
  DateTime? get lockedAt;

  AppealReviewerAssignmentsItemsInner._();

  factory AppealReviewerAssignmentsItemsInner([void updates(AppealReviewerAssignmentsItemsInnerBuilder b)]) = _$AppealReviewerAssignmentsItemsInner;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(AppealReviewerAssignmentsItemsInnerBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<AppealReviewerAssignmentsItemsInner> get serializer => _$AppealReviewerAssignmentsItemsInnerSerializer();
}

class _$AppealReviewerAssignmentsItemsInnerSerializer implements PrimitiveSerializer<AppealReviewerAssignmentsItemsInner> {
  @override
  final Iterable<Type> types = const [AppealReviewerAssignmentsItemsInner, _$AppealReviewerAssignmentsItemsInner];

  @override
  final String wireName = r'AppealReviewerAssignmentsItemsInner';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    AppealReviewerAssignmentsItemsInner object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    yield r'id';
    yield serializers.serialize(
      object.id,
      specifiedType: const FullType(String),
    );
    yield r'appeal_id';
    yield serializers.serialize(
      object.appealId,
      specifiedType: const FullType(String),
    );
    yield r'state';
    yield serializers.serialize(
      object.state,
      specifiedType: const FullType(AppealReviewerAssignmentsItemsInnerStateEnum),
    );
    yield r'assigned_at';
    yield serializers.serialize(
      object.assignedAt,
      specifiedType: const FullType(DateTime),
    );
    yield r'risk_class';
    yield serializers.serialize(
      object.riskClass,
      specifiedType: const FullType(AppealReviewerAssignmentsItemsInnerRiskClassEnum),
    );
    yield r'expires_at';
    yield serializers.serialize(
      object.expiresAt,
      specifiedType: const FullType(DateTime),
    );
    yield r'policy_version';
    yield serializers.serialize(
      object.policyVersion,
      specifiedType: const FullType(String),
    );
    if (object.decision != null) {
      yield r'decision';
      yield serializers.serialize(
        object.decision,
        specifiedType: const FullType.nullable(AppealReviewerAssignmentsItemsInnerDecisionEnum),
      );
    }
    if (object.lockedAt != null) {
      yield r'locked_at';
      yield serializers.serialize(
        object.lockedAt,
        specifiedType: const FullType.nullable(DateTime),
      );
    }
  }

  @override
  Object serialize(
    Serializers serializers,
    AppealReviewerAssignmentsItemsInner object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required AppealReviewerAssignmentsItemsInnerBuilder result,
    required List<Object?> unhandled,
  }) {
    for (var i = 0; i < serializedList.length; i += 2) {
      final key = serializedList[i] as String;
      final value = serializedList[i + 1];
      switch (key) {
        case r'id':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.id = valueDes;
          break;
        case r'appeal_id':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.appealId = valueDes;
          break;
        case r'state':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(AppealReviewerAssignmentsItemsInnerStateEnum),
          ) as AppealReviewerAssignmentsItemsInnerStateEnum;
          result.state = valueDes;
          break;
        case r'assigned_at':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(DateTime),
          ) as DateTime;
          result.assignedAt = valueDes;
          break;
        case r'risk_class':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(AppealReviewerAssignmentsItemsInnerRiskClassEnum),
          ) as AppealReviewerAssignmentsItemsInnerRiskClassEnum;
          result.riskClass = valueDes;
          break;
        case r'expires_at':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(DateTime),
          ) as DateTime;
          result.expiresAt = valueDes;
          break;
        case r'policy_version':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.policyVersion = valueDes;
          break;
        case r'decision':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType.nullable(AppealReviewerAssignmentsItemsInnerDecisionEnum),
          ) as AppealReviewerAssignmentsItemsInnerDecisionEnum?;
          if (valueDes == null) continue;
          result.decision = valueDes;
          break;
        case r'locked_at':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType.nullable(DateTime),
          ) as DateTime?;
          if (valueDes == null) continue;
          result.lockedAt = valueDes;
          break;
        default:
          unhandled.add(key);
          unhandled.add(value);
          break;
      }
    }
  }

  @override
  AppealReviewerAssignmentsItemsInner deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = AppealReviewerAssignmentsItemsInnerBuilder();
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

class AppealReviewerAssignmentsItemsInnerStateEnum extends EnumClass {

  @BuiltValueEnumConst(wireName: r'assigned')
  static const AppealReviewerAssignmentsItemsInnerStateEnum assigned = _$appealReviewerAssignmentsItemsInnerStateEnum_assigned;
  @BuiltValueEnumConst(wireName: r'recused')
  static const AppealReviewerAssignmentsItemsInnerStateEnum recused = _$appealReviewerAssignmentsItemsInnerStateEnum_recused;
  @BuiltValueEnumConst(wireName: r'voted')
  static const AppealReviewerAssignmentsItemsInnerStateEnum voted = _$appealReviewerAssignmentsItemsInnerStateEnum_voted;
  @BuiltValueEnumConst(wireName: r'replaced')
  static const AppealReviewerAssignmentsItemsInnerStateEnum replaced = _$appealReviewerAssignmentsItemsInnerStateEnum_replaced;
  @BuiltValueEnumConst(wireName: r'expired')
  static const AppealReviewerAssignmentsItemsInnerStateEnum expired = _$appealReviewerAssignmentsItemsInnerStateEnum_expired;

  static Serializer<AppealReviewerAssignmentsItemsInnerStateEnum> get serializer => _$appealReviewerAssignmentsItemsInnerStateEnumSerializer;

  const AppealReviewerAssignmentsItemsInnerStateEnum._(String name): super(name);

  static BuiltSet<AppealReviewerAssignmentsItemsInnerStateEnum> get values => _$appealReviewerAssignmentsItemsInnerStateEnumValues;
  static AppealReviewerAssignmentsItemsInnerStateEnum valueOf(String name) => _$appealReviewerAssignmentsItemsInnerStateEnumValueOf(name);
}

class AppealReviewerAssignmentsItemsInnerRiskClassEnum extends EnumClass {

  @BuiltValueEnumConst(wireName: r'standard')
  static const AppealReviewerAssignmentsItemsInnerRiskClassEnum standard = _$appealReviewerAssignmentsItemsInnerRiskClassEnum_standard;
  @BuiltValueEnumConst(wireName: r'high')
  static const AppealReviewerAssignmentsItemsInnerRiskClassEnum high = _$appealReviewerAssignmentsItemsInnerRiskClassEnum_high;

  static Serializer<AppealReviewerAssignmentsItemsInnerRiskClassEnum> get serializer => _$appealReviewerAssignmentsItemsInnerRiskClassEnumSerializer;

  const AppealReviewerAssignmentsItemsInnerRiskClassEnum._(String name): super(name);

  static BuiltSet<AppealReviewerAssignmentsItemsInnerRiskClassEnum> get values => _$appealReviewerAssignmentsItemsInnerRiskClassEnumValues;
  static AppealReviewerAssignmentsItemsInnerRiskClassEnum valueOf(String name) => _$appealReviewerAssignmentsItemsInnerRiskClassEnumValueOf(name);
}

class AppealReviewerAssignmentsItemsInnerDecisionEnum extends EnumClass {

  @BuiltValueEnumConst(wireName: r'overturn')
  static const AppealReviewerAssignmentsItemsInnerDecisionEnum overturn = _$appealReviewerAssignmentsItemsInnerDecisionEnum_overturn;
  @BuiltValueEnumConst(wireName: r'uphold')
  static const AppealReviewerAssignmentsItemsInnerDecisionEnum uphold = _$appealReviewerAssignmentsItemsInnerDecisionEnum_uphold;

  static Serializer<AppealReviewerAssignmentsItemsInnerDecisionEnum> get serializer => _$appealReviewerAssignmentsItemsInnerDecisionEnumSerializer;

  const AppealReviewerAssignmentsItemsInnerDecisionEnum._(String name): super(name);

  static BuiltSet<AppealReviewerAssignmentsItemsInnerDecisionEnum> get values => _$appealReviewerAssignmentsItemsInnerDecisionEnumValues;
  static AppealReviewerAssignmentsItemsInnerDecisionEnum valueOf(String name) => _$appealReviewerAssignmentsItemsInnerDecisionEnumValueOf(name);
}
