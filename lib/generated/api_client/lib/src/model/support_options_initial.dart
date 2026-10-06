//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'support_options_initial.g.dart';

/// SupportOptionsInitial
///
/// Properties:
/// * [problem]
/// * [suggestion]
@BuiltValue()
abstract class SupportOptionsInitial implements Built<SupportOptionsInitial, SupportOptionsInitialBuilder> {
  @BuiltValueField(wireName: r'problem')
  String? get problem;

  @BuiltValueField(wireName: r'suggestion')
  String? get suggestion;

  SupportOptionsInitial._();

  factory SupportOptionsInitial([void updates(SupportOptionsInitialBuilder b)]) = _$SupportOptionsInitial;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(SupportOptionsInitialBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<SupportOptionsInitial> get serializer => _$SupportOptionsInitialSerializer();
}

class _$SupportOptionsInitialSerializer implements PrimitiveSerializer<SupportOptionsInitial> {
  @override
  final Iterable<Type> types = const [SupportOptionsInitial, _$SupportOptionsInitial];

  @override
  final String wireName = r'SupportOptionsInitial';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    SupportOptionsInitial object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    if (object.problem != null) {
      yield r'problem';
      yield serializers.serialize(
        object.problem,
        specifiedType: const FullType(String),
      );
    }
    if (object.suggestion != null) {
      yield r'suggestion';
      yield serializers.serialize(
        object.suggestion,
        specifiedType: const FullType(String),
      );
    }
  }

  @override
  Object serialize(
    Serializers serializers,
    SupportOptionsInitial object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required SupportOptionsInitialBuilder result,
    required List<Object?> unhandled,
  }) {
    for (var i = 0; i < serializedList.length; i += 2) {
      final key = serializedList[i] as String;
      final value = serializedList[i + 1];
      switch (key) {
        case r'problem':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.problem = valueDes;
          break;
        case r'suggestion':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.suggestion = valueDes;
          break;
        default:
          unhandled.add(key);
          unhandled.add(value);
          break;
      }
    }
  }

  @override
  SupportOptionsInitial deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = SupportOptionsInitialBuilder();
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
