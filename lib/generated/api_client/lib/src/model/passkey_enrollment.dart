//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'passkey_enrollment.g.dart';

/// PasskeyEnrollment
///
/// Properties:
/// * [id]
/// * [enrolled]
@BuiltValue()
abstract class PasskeyEnrollment implements Built<PasskeyEnrollment, PasskeyEnrollmentBuilder> {
  @BuiltValueField(wireName: r'id')
  String get id;

  @BuiltValueField(wireName: r'enrolled')
  bool get enrolled;

  PasskeyEnrollment._();

  factory PasskeyEnrollment([void updates(PasskeyEnrollmentBuilder b)]) = _$PasskeyEnrollment;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(PasskeyEnrollmentBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<PasskeyEnrollment> get serializer => _$PasskeyEnrollmentSerializer();
}

class _$PasskeyEnrollmentSerializer implements PrimitiveSerializer<PasskeyEnrollment> {
  @override
  final Iterable<Type> types = const [PasskeyEnrollment, _$PasskeyEnrollment];

  @override
  final String wireName = r'PasskeyEnrollment';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    PasskeyEnrollment object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    yield r'id';
    yield serializers.serialize(
      object.id,
      specifiedType: const FullType(String),
    );
    yield r'enrolled';
    yield serializers.serialize(
      object.enrolled,
      specifiedType: const FullType(bool),
    );
  }

  @override
  Object serialize(
    Serializers serializers,
    PasskeyEnrollment object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required PasskeyEnrollmentBuilder result,
    required List<Object?> unhandled,
  }) {
    for (var i = 0; i < serializedList.length; i += 2) {
      final key = serializedList[i] as String;
      final value = serializedList[i + 1];
      switch (key) {
        case r'id':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.id = valueDes;
          break;
        case r'enrolled':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(bool),
          ) as bool;
          result.enrolled = valueDes;
          break;
        default:
          unhandled.add(key);
          unhandled.add(value);
          break;
      }
    }
  }

  @override
  PasskeyEnrollment deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = PasskeyEnrollmentBuilder();
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
