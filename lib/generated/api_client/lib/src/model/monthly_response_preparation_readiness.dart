//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:built_collection/built_collection.dart';
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'monthly_response_preparation_readiness.g.dart';

/// Preparation metadata only. Production v2 admission is disabled, so preparedResponse remains null. The prospective maximum is a policy ceiling, never an assessed score or entitlement. No request parameter selects this version or supplies a preparation context.
///
/// Properties:
/// * [state]
/// * [reasonCode]
/// * [responseVersion]
/// * [policyVersion]
/// * [catalogueHash]
/// * [dataVersion]
/// * [maximumSourceMonth]
/// * [preparationOnly]
/// * [runtimeActivationAllowed]
/// * [appliedPoints]
@BuiltValue()
abstract class MonthlyResponsePreparationReadiness implements Built<MonthlyResponsePreparationReadiness, MonthlyResponsePreparationReadinessBuilder> {
  @BuiltValueField(wireName: r'state')
  MonthlyResponsePreparationReadinessStateEnum get state;
  // enum stateEnum {  disabled,  unavailable,  };

  @BuiltValueField(wireName: r'reasonCode')
  MonthlyResponsePreparationReadinessReasonCodeEnum get reasonCode;
  // enum reasonCodeEnum {  activation_not_approved,  response_version_unsupported,  };

  @BuiltValueField(wireName: r'responseVersion')
  String? get responseVersion;

  @BuiltValueField(wireName: r'policyVersion')
  String? get policyVersion;

  @BuiltValueField(wireName: r'catalogueHash')
  String? get catalogueHash;

  @BuiltValueField(wireName: r'dataVersion')
  int? get dataVersion;

  @BuiltValueField(wireName: r'maximumSourceMonth')
  int? get maximumSourceMonth;

  @BuiltValueField(wireName: r'preparationOnly')
  bool get preparationOnly;

  @BuiltValueField(wireName: r'runtimeActivationAllowed')
  bool get runtimeActivationAllowed;

  @BuiltValueField(wireName: r'appliedPoints')
  int get appliedPoints;

  MonthlyResponsePreparationReadiness._();

  factory MonthlyResponsePreparationReadiness([void updates(MonthlyResponsePreparationReadinessBuilder b)]) = _$MonthlyResponsePreparationReadiness;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(MonthlyResponsePreparationReadinessBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<MonthlyResponsePreparationReadiness> get serializer => _$MonthlyResponsePreparationReadinessSerializer();
}

class _$MonthlyResponsePreparationReadinessSerializer implements PrimitiveSerializer<MonthlyResponsePreparationReadiness> {
  @override
  final Iterable<Type> types = const [MonthlyResponsePreparationReadiness, _$MonthlyResponsePreparationReadiness];

  @override
  final String wireName = r'MonthlyResponsePreparationReadiness';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    MonthlyResponsePreparationReadiness object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    yield r'state';
    yield serializers.serialize(
      object.state,
      specifiedType: const FullType(MonthlyResponsePreparationReadinessStateEnum),
    );
    yield r'reasonCode';
    yield serializers.serialize(
      object.reasonCode,
      specifiedType: const FullType(MonthlyResponsePreparationReadinessReasonCodeEnum),
    );
    yield r'responseVersion';
    yield object.responseVersion == null ? null : serializers.serialize(
      object.responseVersion,
      specifiedType: const FullType.nullable(String),
    );
    yield r'policyVersion';
    yield object.policyVersion == null ? null : serializers.serialize(
      object.policyVersion,
      specifiedType: const FullType.nullable(String),
    );
    yield r'catalogueHash';
    yield object.catalogueHash == null ? null : serializers.serialize(
      object.catalogueHash,
      specifiedType: const FullType.nullable(String),
    );
    yield r'dataVersion';
    yield object.dataVersion == null ? null : serializers.serialize(
      object.dataVersion,
      specifiedType: const FullType.nullable(int),
    );
    yield r'maximumSourceMonth';
    yield object.maximumSourceMonth == null ? null : serializers.serialize(
      object.maximumSourceMonth,
      specifiedType: const FullType.nullable(int),
    );
    yield r'preparationOnly';
    yield serializers.serialize(
      object.preparationOnly,
      specifiedType: const FullType(bool),
    );
    yield r'runtimeActivationAllowed';
    yield serializers.serialize(
      object.runtimeActivationAllowed,
      specifiedType: const FullType(bool),
    );
    yield r'appliedPoints';
    yield serializers.serialize(
      object.appliedPoints,
      specifiedType: const FullType(int),
    );
  }

  @override
  Object serialize(
    Serializers serializers,
    MonthlyResponsePreparationReadiness object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required MonthlyResponsePreparationReadinessBuilder result,
    required List<Object?> unhandled,
  }) {
    for (var i = 0; i < serializedList.length; i += 2) {
      final key = serializedList[i] as String;
      final value = serializedList[i + 1];
      switch (key) {
        case r'state':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(MonthlyResponsePreparationReadinessStateEnum),
          ) as MonthlyResponsePreparationReadinessStateEnum;
          result.state = valueDes;
          break;
        case r'reasonCode':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(MonthlyResponsePreparationReadinessReasonCodeEnum),
          ) as MonthlyResponsePreparationReadinessReasonCodeEnum;
          result.reasonCode = valueDes;
          break;
        case r'responseVersion':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType.nullable(String),
          ) as String?;
          if (valueDes == null) continue;
          result.responseVersion = valueDes;
          break;
        case r'policyVersion':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType.nullable(String),
          ) as String?;
          if (valueDes == null) continue;
          result.policyVersion = valueDes;
          break;
        case r'catalogueHash':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType.nullable(String),
          ) as String?;
          if (valueDes == null) continue;
          result.catalogueHash = valueDes;
          break;
        case r'dataVersion':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType.nullable(int),
          ) as int?;
          if (valueDes == null) continue;
          result.dataVersion = valueDes;
          break;
        case r'maximumSourceMonth':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType.nullable(int),
          ) as int?;
          if (valueDes == null) continue;
          result.maximumSourceMonth = valueDes;
          break;
        case r'preparationOnly':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(bool),
          ) as bool;
          result.preparationOnly = valueDes;
          break;
        case r'runtimeActivationAllowed':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(bool),
          ) as bool;
          result.runtimeActivationAllowed = valueDes;
          break;
        case r'appliedPoints':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(int),
          ) as int;
          result.appliedPoints = valueDes;
          break;
        default:
          unhandled.add(key);
          unhandled.add(value);
          break;
      }
    }
  }

  @override
  MonthlyResponsePreparationReadiness deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = MonthlyResponsePreparationReadinessBuilder();
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

class MonthlyResponsePreparationReadinessStateEnum extends EnumClass {

  @BuiltValueEnumConst(wireName: r'disabled')
  static const MonthlyResponsePreparationReadinessStateEnum disabled = _$monthlyResponsePreparationReadinessStateEnum_disabled;
  @BuiltValueEnumConst(wireName: r'unavailable')
  static const MonthlyResponsePreparationReadinessStateEnum unavailable = _$monthlyResponsePreparationReadinessStateEnum_unavailable;

  static Serializer<MonthlyResponsePreparationReadinessStateEnum> get serializer => _$monthlyResponsePreparationReadinessStateEnumSerializer;

  const MonthlyResponsePreparationReadinessStateEnum._(String name): super(name);

  static BuiltSet<MonthlyResponsePreparationReadinessStateEnum> get values => _$monthlyResponsePreparationReadinessStateEnumValues;
  static MonthlyResponsePreparationReadinessStateEnum valueOf(String name) => _$monthlyResponsePreparationReadinessStateEnumValueOf(name);
}

class MonthlyResponsePreparationReadinessReasonCodeEnum extends EnumClass {

  @BuiltValueEnumConst(wireName: r'activation_not_approved')
  static const MonthlyResponsePreparationReadinessReasonCodeEnum activationNotApproved = _$monthlyResponsePreparationReadinessReasonCodeEnum_activationNotApproved;
  @BuiltValueEnumConst(wireName: r'response_version_unsupported')
  static const MonthlyResponsePreparationReadinessReasonCodeEnum responseVersionUnsupported = _$monthlyResponsePreparationReadinessReasonCodeEnum_responseVersionUnsupported;

  static Serializer<MonthlyResponsePreparationReadinessReasonCodeEnum> get serializer => _$monthlyResponsePreparationReadinessReasonCodeEnumSerializer;

  const MonthlyResponsePreparationReadinessReasonCodeEnum._(String name): super(name);

  static BuiltSet<MonthlyResponsePreparationReadinessReasonCodeEnum> get values => _$monthlyResponsePreparationReadinessReasonCodeEnumValues;
  static MonthlyResponsePreparationReadinessReasonCodeEnum valueOf(String name) => _$monthlyResponsePreparationReadinessReasonCodeEnumValueOf(name);
}
