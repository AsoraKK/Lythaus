//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:built_collection/built_collection.dart';
import 'package:lythaus_api_client/src/model/support_options_initial.dart';
import 'package:lythaus_api_client/src/model/support_transition.dart';
import 'package:lythaus_api_client/src/model/support_feedback_policy.dart';
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'support_options.g.dart';

/// SupportOptions
///
/// Properties:
/// * [version]
/// * [contract]
/// * [limits]
/// * [initial]
/// * [transitions]
/// * [evidenceTypes]
@BuiltValue()
abstract class SupportOptions implements Built<SupportOptions, SupportOptionsBuilder> {
  @BuiltValueField(wireName: r'version')
  String get version;

  @BuiltValueField(wireName: r'contract')
  SupportFeedbackPolicy get contract;

  @BuiltValueField(wireName: r'limits')
  BuiltMap<String, int> get limits;

  @BuiltValueField(wireName: r'initial')
  SupportOptionsInitial? get initial;

  @BuiltValueField(wireName: r'transitions')
  BuiltList<SupportTransition>? get transitions;

  @BuiltValueField(wireName: r'evidenceTypes')
  BuiltList<String>? get evidenceTypes;

  SupportOptions._();

  factory SupportOptions([void updates(SupportOptionsBuilder b)]) = _$SupportOptions;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(SupportOptionsBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<SupportOptions> get serializer => _$SupportOptionsSerializer();
}

class _$SupportOptionsSerializer implements PrimitiveSerializer<SupportOptions> {
  @override
  final Iterable<Type> types = const [SupportOptions, _$SupportOptions];

  @override
  final String wireName = r'SupportOptions';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    SupportOptions object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    yield r'version';
    yield serializers.serialize(
      object.version,
      specifiedType: const FullType(String),
    );
    yield r'contract';
    yield serializers.serialize(
      object.contract,
      specifiedType: const FullType(SupportFeedbackPolicy),
    );
    yield r'limits';
    yield serializers.serialize(
      object.limits,
      specifiedType: const FullType(BuiltMap, [FullType(String), FullType(int)]),
    );
    if (object.initial != null) {
      yield r'initial';
      yield serializers.serialize(
        object.initial,
        specifiedType: const FullType(SupportOptionsInitial),
      );
    }
    if (object.transitions != null) {
      yield r'transitions';
      yield serializers.serialize(
        object.transitions,
        specifiedType: const FullType(BuiltList, [FullType(SupportTransition)]),
      );
    }
    if (object.evidenceTypes != null) {
      yield r'evidenceTypes';
      yield serializers.serialize(
        object.evidenceTypes,
        specifiedType: const FullType(BuiltList, [FullType(String)]),
      );
    }
  }

  @override
  Object serialize(
    Serializers serializers,
    SupportOptions object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required SupportOptionsBuilder result,
    required List<Object?> unhandled,
  }) {
    for (var i = 0; i < serializedList.length; i += 2) {
      final key = serializedList[i] as String;
      final value = serializedList[i + 1];
      switch (key) {
        case r'version':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.version = valueDes;
          break;
        case r'contract':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(SupportFeedbackPolicy),
          ) as SupportFeedbackPolicy;
          result.contract.replace(valueDes);
          break;
        case r'limits':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(BuiltMap, [FullType(String), FullType(int)]),
          ) as BuiltMap<String, int>;
          result.limits.replace(valueDes);
          break;
        case r'initial':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(SupportOptionsInitial),
          ) as SupportOptionsInitial;
          result.initial.replace(valueDes);
          break;
        case r'transitions':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(BuiltList, [FullType(SupportTransition)]),
          ) as BuiltList<SupportTransition>;
          result.transitions.replace(valueDes);
          break;
        case r'evidenceTypes':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(BuiltList, [FullType(String)]),
          ) as BuiltList<String>;
          result.evidenceTypes.replace(valueDes);
          break;
        default:
          unhandled.add(key);
          unhandled.add(value);
          break;
      }
    }
  }

  @override
  SupportOptions deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = SupportOptionsBuilder();
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
