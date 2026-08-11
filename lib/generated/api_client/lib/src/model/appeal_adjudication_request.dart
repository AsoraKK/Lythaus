//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:built_collection/built_collection.dart';
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'appeal_adjudication_request.g.dart';

/// AppealAdjudicationRequest
///
/// Properties:
/// * [decision]
/// * [reasonCode]
@BuiltValue()
abstract class AppealAdjudicationRequest implements Built<AppealAdjudicationRequest, AppealAdjudicationRequestBuilder> {
  @BuiltValueField(wireName: r'decision')
  AppealAdjudicationRequestDecisionEnum get decision;
  // enum decisionEnum {  overturn,  uphold,  };

  @BuiltValueField(wireName: r'reasonCode')
  String get reasonCode;

  AppealAdjudicationRequest._();

  factory AppealAdjudicationRequest([void updates(AppealAdjudicationRequestBuilder b)]) = _$AppealAdjudicationRequest;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(AppealAdjudicationRequestBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<AppealAdjudicationRequest> get serializer => _$AppealAdjudicationRequestSerializer();
}

class _$AppealAdjudicationRequestSerializer implements PrimitiveSerializer<AppealAdjudicationRequest> {
  @override
  final Iterable<Type> types = const [AppealAdjudicationRequest, _$AppealAdjudicationRequest];

  @override
  final String wireName = r'AppealAdjudicationRequest';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    AppealAdjudicationRequest object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    yield r'decision';
    yield serializers.serialize(
      object.decision,
      specifiedType: const FullType(AppealAdjudicationRequestDecisionEnum),
    );
    yield r'reasonCode';
    yield serializers.serialize(
      object.reasonCode,
      specifiedType: const FullType(String),
    );
  }

  @override
  Object serialize(
    Serializers serializers,
    AppealAdjudicationRequest object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required AppealAdjudicationRequestBuilder result,
    required List<Object?> unhandled,
  }) {
    for (var i = 0; i < serializedList.length; i += 2) {
      final key = serializedList[i] as String;
      final value = serializedList[i + 1];
      switch (key) {
        case r'decision':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(AppealAdjudicationRequestDecisionEnum),
          ) as AppealAdjudicationRequestDecisionEnum;
          result.decision = valueDes;
          break;
        case r'reasonCode':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.reasonCode = valueDes;
          break;
        default:
          unhandled.add(key);
          unhandled.add(value);
          break;
      }
    }
  }

  @override
  AppealAdjudicationRequest deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = AppealAdjudicationRequestBuilder();
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

class AppealAdjudicationRequestDecisionEnum extends EnumClass {

  @BuiltValueEnumConst(wireName: r'overturn')
  static const AppealAdjudicationRequestDecisionEnum overturn = _$appealAdjudicationRequestDecisionEnum_overturn;
  @BuiltValueEnumConst(wireName: r'uphold')
  static const AppealAdjudicationRequestDecisionEnum uphold = _$appealAdjudicationRequestDecisionEnum_uphold;

  static Serializer<AppealAdjudicationRequestDecisionEnum> get serializer => _$appealAdjudicationRequestDecisionEnumSerializer;

  const AppealAdjudicationRequestDecisionEnum._(String name): super(name);

  static BuiltSet<AppealAdjudicationRequestDecisionEnum> get values => _$appealAdjudicationRequestDecisionEnumValues;
  static AppealAdjudicationRequestDecisionEnum valueOf(String name) => _$appealAdjudicationRequestDecisionEnumValueOf(name);
}
