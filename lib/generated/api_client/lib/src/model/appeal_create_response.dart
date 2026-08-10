//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:built_collection/built_collection.dart';
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'appeal_create_response.g.dart';

/// AppealCreateResponse
///
/// Properties:
/// * [appealId]
/// * [state]
/// * [riskClass]
/// * [policyVersion]
@BuiltValue()
abstract class AppealCreateResponse implements Built<AppealCreateResponse, AppealCreateResponseBuilder> {
  @BuiltValueField(wireName: r'appealId')
  String get appealId;

  @BuiltValueField(wireName: r'state')
  AppealCreateResponseStateEnum get state;
  // enum stateEnum {  open,  };

  @BuiltValueField(wireName: r'riskClass')
  AppealCreateResponseRiskClassEnum get riskClass;
  // enum riskClassEnum {  standard,  high,  };

  @BuiltValueField(wireName: r'policyVersion')
  String get policyVersion;

  AppealCreateResponse._();

  factory AppealCreateResponse([void updates(AppealCreateResponseBuilder b)]) = _$AppealCreateResponse;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(AppealCreateResponseBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<AppealCreateResponse> get serializer => _$AppealCreateResponseSerializer();
}

class _$AppealCreateResponseSerializer implements PrimitiveSerializer<AppealCreateResponse> {
  @override
  final Iterable<Type> types = const [AppealCreateResponse, _$AppealCreateResponse];

  @override
  final String wireName = r'AppealCreateResponse';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    AppealCreateResponse object, {
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
      specifiedType: const FullType(AppealCreateResponseStateEnum),
    );
    yield r'riskClass';
    yield serializers.serialize(
      object.riskClass,
      specifiedType: const FullType(AppealCreateResponseRiskClassEnum),
    );
    yield r'policyVersion';
    yield serializers.serialize(
      object.policyVersion,
      specifiedType: const FullType(String),
    );
  }

  @override
  Object serialize(
    Serializers serializers,
    AppealCreateResponse object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required AppealCreateResponseBuilder result,
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
            specifiedType: const FullType(AppealCreateResponseStateEnum),
          ) as AppealCreateResponseStateEnum;
          result.state = valueDes;
          break;
        case r'riskClass':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(AppealCreateResponseRiskClassEnum),
          ) as AppealCreateResponseRiskClassEnum;
          result.riskClass = valueDes;
          break;
        case r'policyVersion':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.policyVersion = valueDes;
          break;
        default:
          unhandled.add(key);
          unhandled.add(value);
          break;
      }
    }
  }

  @override
  AppealCreateResponse deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = AppealCreateResponseBuilder();
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

class AppealCreateResponseStateEnum extends EnumClass {

  @BuiltValueEnumConst(wireName: r'open')
  static const AppealCreateResponseStateEnum open = _$appealCreateResponseStateEnum_open;

  static Serializer<AppealCreateResponseStateEnum> get serializer => _$appealCreateResponseStateEnumSerializer;

  const AppealCreateResponseStateEnum._(String name): super(name);

  static BuiltSet<AppealCreateResponseStateEnum> get values => _$appealCreateResponseStateEnumValues;
  static AppealCreateResponseStateEnum valueOf(String name) => _$appealCreateResponseStateEnumValueOf(name);
}

class AppealCreateResponseRiskClassEnum extends EnumClass {

  @BuiltValueEnumConst(wireName: r'standard')
  static const AppealCreateResponseRiskClassEnum standard = _$appealCreateResponseRiskClassEnum_standard;
  @BuiltValueEnumConst(wireName: r'high')
  static const AppealCreateResponseRiskClassEnum high = _$appealCreateResponseRiskClassEnum_high;

  static Serializer<AppealCreateResponseRiskClassEnum> get serializer => _$appealCreateResponseRiskClassEnumSerializer;

  const AppealCreateResponseRiskClassEnum._(String name): super(name);

  static BuiltSet<AppealCreateResponseRiskClassEnum> get values => _$appealCreateResponseRiskClassEnumValues;
  static AppealCreateResponseRiskClassEnum valueOf(String name) => _$appealCreateResponseRiskClassEnumValueOf(name);
}
