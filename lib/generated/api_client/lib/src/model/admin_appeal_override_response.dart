//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:lythaus_api_client/src/model/admin_appeal_final_decision.dart';
import 'package:built_collection/built_collection.dart';
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'admin_appeal_override_response.g.dart';

/// AdminAppealOverrideResponse
///
/// Properties:
/// * [appealId]
/// * [status]
/// * [finalDecision]
@BuiltValue()
abstract class AdminAppealOverrideResponse implements Built<AdminAppealOverrideResponse, AdminAppealOverrideResponseBuilder> {
  @BuiltValueField(wireName: r'appealId')
  String? get appealId;

  @BuiltValueField(wireName: r'status')
  AdminAppealOverrideResponseStatusEnum? get status;
  // enum statusEnum {  overridden,  };

  @BuiltValueField(wireName: r'finalDecision')
  AdminAppealFinalDecision? get finalDecision;
  // enum finalDecisionEnum {  allow,  block,  };

  AdminAppealOverrideResponse._();

  factory AdminAppealOverrideResponse([void updates(AdminAppealOverrideResponseBuilder b)]) = _$AdminAppealOverrideResponse;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(AdminAppealOverrideResponseBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<AdminAppealOverrideResponse> get serializer => _$AdminAppealOverrideResponseSerializer();
}

class _$AdminAppealOverrideResponseSerializer implements PrimitiveSerializer<AdminAppealOverrideResponse> {
  @override
  final Iterable<Type> types = const [AdminAppealOverrideResponse, _$AdminAppealOverrideResponse];

  @override
  final String wireName = r'AdminAppealOverrideResponse';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    AdminAppealOverrideResponse object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    if (object.appealId != null) {
      yield r'appealId';
      yield serializers.serialize(
        object.appealId,
        specifiedType: const FullType(String),
      );
    }
    if (object.status != null) {
      yield r'status';
      yield serializers.serialize(
        object.status,
        specifiedType: const FullType(AdminAppealOverrideResponseStatusEnum),
      );
    }
    if (object.finalDecision != null) {
      yield r'finalDecision';
      yield serializers.serialize(
        object.finalDecision,
        specifiedType: const FullType(AdminAppealFinalDecision),
      );
    }
  }

  @override
  Object serialize(
    Serializers serializers,
    AdminAppealOverrideResponse object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required AdminAppealOverrideResponseBuilder result,
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
        case r'status':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(AdminAppealOverrideResponseStatusEnum),
          ) as AdminAppealOverrideResponseStatusEnum;
          result.status = valueDes;
          break;
        case r'finalDecision':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(AdminAppealFinalDecision),
          ) as AdminAppealFinalDecision;
          result.finalDecision = valueDes;
          break;
        default:
          unhandled.add(key);
          unhandled.add(value);
          break;
      }
    }
  }

  @override
  AdminAppealOverrideResponse deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = AdminAppealOverrideResponseBuilder();
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

class AdminAppealOverrideResponseStatusEnum extends EnumClass {

  @BuiltValueEnumConst(wireName: r'overridden')
  static const AdminAppealOverrideResponseStatusEnum overridden = _$adminAppealOverrideResponseStatusEnum_overridden;

  static Serializer<AdminAppealOverrideResponseStatusEnum> get serializer => _$adminAppealOverrideResponseStatusEnumSerializer;

  const AdminAppealOverrideResponseStatusEnum._(String name): super(name);

  static BuiltSet<AdminAppealOverrideResponseStatusEnum> get values => _$adminAppealOverrideResponseStatusEnumValues;
  static AdminAppealOverrideResponseStatusEnum valueOf(String name) => _$adminAppealOverrideResponseStatusEnumValueOf(name);
}
