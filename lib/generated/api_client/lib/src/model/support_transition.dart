//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:built_collection/built_collection.dart';
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'support_transition.g.dart';

/// SupportTransition
///
/// Properties:
/// * [kind]
/// * [from]
/// * [to]
/// * [terminal]
/// * [reasons]
/// * [evidenceTypes]
@BuiltValue()
abstract class SupportTransition implements Built<SupportTransition, SupportTransitionBuilder> {
  @BuiltValueField(wireName: r'kind')
  SupportTransitionKindEnum get kind;
  // enum kindEnum {  problem,  suggestion,  };

  @BuiltValueField(wireName: r'from')
  String get from;

  @BuiltValueField(wireName: r'to')
  String get to;

  @BuiltValueField(wireName: r'terminal')
  bool get terminal;

  @BuiltValueField(wireName: r'reasons')
  BuiltList<String> get reasons;

  @BuiltValueField(wireName: r'evidenceTypes')
  BuiltList<String> get evidenceTypes;

  SupportTransition._();

  factory SupportTransition([void updates(SupportTransitionBuilder b)]) = _$SupportTransition;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(SupportTransitionBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<SupportTransition> get serializer => _$SupportTransitionSerializer();
}

class _$SupportTransitionSerializer implements PrimitiveSerializer<SupportTransition> {
  @override
  final Iterable<Type> types = const [SupportTransition, _$SupportTransition];

  @override
  final String wireName = r'SupportTransition';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    SupportTransition object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    yield r'kind';
    yield serializers.serialize(
      object.kind,
      specifiedType: const FullType(SupportTransitionKindEnum),
    );
    yield r'from';
    yield serializers.serialize(
      object.from,
      specifiedType: const FullType(String),
    );
    yield r'to';
    yield serializers.serialize(
      object.to,
      specifiedType: const FullType(String),
    );
    yield r'terminal';
    yield serializers.serialize(
      object.terminal,
      specifiedType: const FullType(bool),
    );
    yield r'reasons';
    yield serializers.serialize(
      object.reasons,
      specifiedType: const FullType(BuiltList, [FullType(String)]),
    );
    yield r'evidenceTypes';
    yield serializers.serialize(
      object.evidenceTypes,
      specifiedType: const FullType(BuiltList, [FullType(String)]),
    );
  }

  @override
  Object serialize(
    Serializers serializers,
    SupportTransition object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required SupportTransitionBuilder result,
    required List<Object?> unhandled,
  }) {
    for (var i = 0; i < serializedList.length; i += 2) {
      final key = serializedList[i] as String;
      final value = serializedList[i + 1];
      switch (key) {
        case r'kind':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(SupportTransitionKindEnum),
          ) as SupportTransitionKindEnum;
          result.kind = valueDes;
          break;
        case r'from':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.from = valueDes;
          break;
        case r'to':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.to = valueDes;
          break;
        case r'terminal':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(bool),
          ) as bool;
          result.terminal = valueDes;
          break;
        case r'reasons':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(BuiltList, [FullType(String)]),
          ) as BuiltList<String>;
          result.reasons.replace(valueDes);
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
  SupportTransition deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = SupportTransitionBuilder();
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

class SupportTransitionKindEnum extends EnumClass {

  @BuiltValueEnumConst(wireName: r'problem')
  static const SupportTransitionKindEnum problem = _$supportTransitionKindEnum_problem;
  @BuiltValueEnumConst(wireName: r'suggestion')
  static const SupportTransitionKindEnum suggestion = _$supportTransitionKindEnum_suggestion;

  static Serializer<SupportTransitionKindEnum> get serializer => _$supportTransitionKindEnumSerializer;

  const SupportTransitionKindEnum._(String name): super(name);

  static BuiltSet<SupportTransitionKindEnum> get values => _$supportTransitionKindEnumValues;
  static SupportTransitionKindEnum valueOf(String name) => _$supportTransitionKindEnumValueOf(name);
}
