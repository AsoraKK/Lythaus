//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'legal_hold_create.g.dart';

/// LegalHoldCreate
///
/// Properties:
/// * [subjectId]
/// * [reason]
@BuiltValue()
abstract class LegalHoldCreate implements Built<LegalHoldCreate, LegalHoldCreateBuilder> {
  @BuiltValueField(wireName: r'subjectId')
  String get subjectId;

  @BuiltValueField(wireName: r'reason')
  String get reason;

  LegalHoldCreate._();

  factory LegalHoldCreate([void updates(LegalHoldCreateBuilder b)]) = _$LegalHoldCreate;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(LegalHoldCreateBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<LegalHoldCreate> get serializer => _$LegalHoldCreateSerializer();
}

class _$LegalHoldCreateSerializer implements PrimitiveSerializer<LegalHoldCreate> {
  @override
  final Iterable<Type> types = const [LegalHoldCreate, _$LegalHoldCreate];

  @override
  final String wireName = r'LegalHoldCreate';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    LegalHoldCreate object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    yield r'subjectId';
    yield serializers.serialize(
      object.subjectId,
      specifiedType: const FullType(String),
    );
    yield r'reason';
    yield serializers.serialize(
      object.reason,
      specifiedType: const FullType(String),
    );
  }

  @override
  Object serialize(
    Serializers serializers,
    LegalHoldCreate object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required LegalHoldCreateBuilder result,
    required List<Object?> unhandled,
  }) {
    for (var i = 0; i < serializedList.length; i += 2) {
      final key = serializedList[i] as String;
      final value = serializedList[i + 1];
      switch (key) {
        case r'subjectId':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.subjectId = valueDes;
          break;
        case r'reason':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.reason = valueDes;
          break;
        default:
          unhandled.add(key);
          unhandled.add(value);
          break;
      }
    }
  }

  @override
  LegalHoldCreate deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = LegalHoldCreateBuilder();
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
