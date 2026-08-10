//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:built_collection/built_collection.dart';
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'appeal_recusal_response.g.dart';

/// AppealRecusalResponse
///
/// Properties:
/// * [appealId]
/// * [assignmentId]
/// * [state]
@BuiltValue()
abstract class AppealRecusalResponse implements Built<AppealRecusalResponse, AppealRecusalResponseBuilder> {
  @BuiltValueField(wireName: r'appealId')
  String get appealId;

  @BuiltValueField(wireName: r'assignmentId')
  String get assignmentId;

  @BuiltValueField(wireName: r'state')
  AppealRecusalResponseStateEnum get state;
  // enum stateEnum {  recused,  };

  AppealRecusalResponse._();

  factory AppealRecusalResponse([void updates(AppealRecusalResponseBuilder b)]) = _$AppealRecusalResponse;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(AppealRecusalResponseBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<AppealRecusalResponse> get serializer => _$AppealRecusalResponseSerializer();
}

class _$AppealRecusalResponseSerializer implements PrimitiveSerializer<AppealRecusalResponse> {
  @override
  final Iterable<Type> types = const [AppealRecusalResponse, _$AppealRecusalResponse];

  @override
  final String wireName = r'AppealRecusalResponse';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    AppealRecusalResponse object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    yield r'appealId';
    yield serializers.serialize(
      object.appealId,
      specifiedType: const FullType(String),
    );
    yield r'assignmentId';
    yield serializers.serialize(
      object.assignmentId,
      specifiedType: const FullType(String),
    );
    yield r'state';
    yield serializers.serialize(
      object.state,
      specifiedType: const FullType(AppealRecusalResponseStateEnum),
    );
  }

  @override
  Object serialize(
    Serializers serializers,
    AppealRecusalResponse object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required AppealRecusalResponseBuilder result,
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
        case r'assignmentId':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.assignmentId = valueDes;
          break;
        case r'state':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(AppealRecusalResponseStateEnum),
          ) as AppealRecusalResponseStateEnum;
          result.state = valueDes;
          break;
        default:
          unhandled.add(key);
          unhandled.add(value);
          break;
      }
    }
  }

  @override
  AppealRecusalResponse deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = AppealRecusalResponseBuilder();
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

class AppealRecusalResponseStateEnum extends EnumClass {

  @BuiltValueEnumConst(wireName: r'recused')
  static const AppealRecusalResponseStateEnum recused = _$appealRecusalResponseStateEnum_recused;

  static Serializer<AppealRecusalResponseStateEnum> get serializer => _$appealRecusalResponseStateEnumSerializer;

  const AppealRecusalResponseStateEnum._(String name): super(name);

  static BuiltSet<AppealRecusalResponseStateEnum> get values => _$appealRecusalResponseStateEnumValues;
  static AppealRecusalResponseStateEnum valueOf(String name) => _$appealRecusalResponseStateEnumValueOf(name);
}
