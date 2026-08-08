//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:lythaus_api_client/src/model/admin_appeal_final_decision.dart';
import 'package:built_collection/built_collection.dart';
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'admin_appeal_override_request.g.dart';

/// AdminAppealOverrideRequest
///
/// Properties:
/// * [decision]
/// * [reasonCode]
/// * [reasonNote]
@BuiltValue()
abstract class AdminAppealOverrideRequest implements Built<AdminAppealOverrideRequest, AdminAppealOverrideRequestBuilder> {
  @BuiltValueField(wireName: r'decision')
  AdminAppealFinalDecision get decision;
  // enum decisionEnum {  allow,  block,  };

  @BuiltValueField(wireName: r'reasonCode')
  AdminAppealOverrideRequestReasonCodeEnum get reasonCode;
  // enum reasonCodeEnum {  policy_exception,  false_positive,  safety_risk,  other,  };

  @BuiltValueField(wireName: r'reasonNote')
  String? get reasonNote;

  AdminAppealOverrideRequest._();

  factory AdminAppealOverrideRequest([void updates(AdminAppealOverrideRequestBuilder b)]) = _$AdminAppealOverrideRequest;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(AdminAppealOverrideRequestBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<AdminAppealOverrideRequest> get serializer => _$AdminAppealOverrideRequestSerializer();
}

class _$AdminAppealOverrideRequestSerializer implements PrimitiveSerializer<AdminAppealOverrideRequest> {
  @override
  final Iterable<Type> types = const [AdminAppealOverrideRequest, _$AdminAppealOverrideRequest];

  @override
  final String wireName = r'AdminAppealOverrideRequest';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    AdminAppealOverrideRequest object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    yield r'decision';
    yield serializers.serialize(
      object.decision,
      specifiedType: const FullType(AdminAppealFinalDecision),
    );
    yield r'reasonCode';
    yield serializers.serialize(
      object.reasonCode,
      specifiedType: const FullType(AdminAppealOverrideRequestReasonCodeEnum),
    );
    if (object.reasonNote != null) {
      yield r'reasonNote';
      yield serializers.serialize(
        object.reasonNote,
        specifiedType: const FullType(String),
      );
    }
  }

  @override
  Object serialize(
    Serializers serializers,
    AdminAppealOverrideRequest object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required AdminAppealOverrideRequestBuilder result,
    required List<Object?> unhandled,
  }) {
    for (var i = 0; i < serializedList.length; i += 2) {
      final key = serializedList[i] as String;
      final value = serializedList[i + 1];
      switch (key) {
        case r'decision':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(AdminAppealFinalDecision),
          ) as AdminAppealFinalDecision;
          result.decision = valueDes;
          break;
        case r'reasonCode':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(AdminAppealOverrideRequestReasonCodeEnum),
          ) as AdminAppealOverrideRequestReasonCodeEnum;
          result.reasonCode = valueDes;
          break;
        case r'reasonNote':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.reasonNote = valueDes;
          break;
        default:
          unhandled.add(key);
          unhandled.add(value);
          break;
      }
    }
  }

  @override
  AdminAppealOverrideRequest deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = AdminAppealOverrideRequestBuilder();
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

class AdminAppealOverrideRequestReasonCodeEnum extends EnumClass {

  @BuiltValueEnumConst(wireName: r'policy_exception')
  static const AdminAppealOverrideRequestReasonCodeEnum policyException = _$adminAppealOverrideRequestReasonCodeEnum_policyException;
  @BuiltValueEnumConst(wireName: r'false_positive')
  static const AdminAppealOverrideRequestReasonCodeEnum falsePositive = _$adminAppealOverrideRequestReasonCodeEnum_falsePositive;
  @BuiltValueEnumConst(wireName: r'safety_risk')
  static const AdminAppealOverrideRequestReasonCodeEnum safetyRisk = _$adminAppealOverrideRequestReasonCodeEnum_safetyRisk;
  @BuiltValueEnumConst(wireName: r'other')
  static const AdminAppealOverrideRequestReasonCodeEnum other = _$adminAppealOverrideRequestReasonCodeEnum_other;

  static Serializer<AdminAppealOverrideRequestReasonCodeEnum> get serializer => _$adminAppealOverrideRequestReasonCodeEnumSerializer;

  const AdminAppealOverrideRequestReasonCodeEnum._(String name): super(name);

  static BuiltSet<AdminAppealOverrideRequestReasonCodeEnum> get values => _$adminAppealOverrideRequestReasonCodeEnumValues;
  static AdminAppealOverrideRequestReasonCodeEnum valueOf(String name) => _$adminAppealOverrideRequestReasonCodeEnumValueOf(name);
}
