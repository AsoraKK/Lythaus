//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'admin_mutation_confirmation.g.dart';

/// AdminMutationConfirmation
///
/// Properties:
/// * [reasonCode]
/// * [confirmation]
@BuiltValue()
abstract class AdminMutationConfirmation implements Built<AdminMutationConfirmation, AdminMutationConfirmationBuilder> {
  @BuiltValueField(wireName: r'reasonCode')
  String get reasonCode;

  @BuiltValueField(wireName: r'confirmation')
  String get confirmation;

  AdminMutationConfirmation._();

  factory AdminMutationConfirmation([void updates(AdminMutationConfirmationBuilder b)]) = _$AdminMutationConfirmation;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(AdminMutationConfirmationBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<AdminMutationConfirmation> get serializer => _$AdminMutationConfirmationSerializer();
}

class _$AdminMutationConfirmationSerializer implements PrimitiveSerializer<AdminMutationConfirmation> {
  @override
  final Iterable<Type> types = const [AdminMutationConfirmation, _$AdminMutationConfirmation];

  @override
  final String wireName = r'AdminMutationConfirmation';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    AdminMutationConfirmation object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    yield r'reasonCode';
    yield serializers.serialize(
      object.reasonCode,
      specifiedType: const FullType(String),
    );
    yield r'confirmation';
    yield serializers.serialize(
      object.confirmation,
      specifiedType: const FullType(String),
    );
  }

  @override
  Object serialize(
    Serializers serializers,
    AdminMutationConfirmation object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required AdminMutationConfirmationBuilder result,
    required List<Object?> unhandled,
  }) {
    for (var i = 0; i < serializedList.length; i += 2) {
      final key = serializedList[i] as String;
      final value = serializedList[i + 1];
      switch (key) {
        case r'reasonCode':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.reasonCode = valueDes;
          break;
        case r'confirmation':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.confirmation = valueDes;
          break;
        default:
          unhandled.add(key);
          unhandled.add(value);
          break;
      }
    }
  }

  @override
  AdminMutationConfirmation deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = AdminMutationConfirmationBuilder();
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
