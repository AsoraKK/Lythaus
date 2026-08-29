//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:built_collection/built_collection.dart';
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'admin_waitlist_create.g.dart';

/// AdminWaitlistCreate
///
/// Properties:
/// * [email]
/// * [source_]
/// * [consentVersion]
/// * [reasonCode]
/// * [confirmation]
@BuiltValue()
abstract class AdminWaitlistCreate implements Built<AdminWaitlistCreate, AdminWaitlistCreateBuilder> {
  @BuiltValueField(wireName: r'email')
  String get email;

  @BuiltValueField(wireName: r'source')
  String? get source_;

  @BuiltValueField(wireName: r'consentVersion')
  String? get consentVersion;

  @BuiltValueField(wireName: r'reasonCode')
  String get reasonCode;

  @BuiltValueField(wireName: r'confirmation')
  AdminWaitlistCreateConfirmationEnum get confirmation;
  // enum confirmationEnum {  ADD WAITLIST,  };

  AdminWaitlistCreate._();

  factory AdminWaitlistCreate([void updates(AdminWaitlistCreateBuilder b)]) = _$AdminWaitlistCreate;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(AdminWaitlistCreateBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<AdminWaitlistCreate> get serializer => _$AdminWaitlistCreateSerializer();
}

class _$AdminWaitlistCreateSerializer implements PrimitiveSerializer<AdminWaitlistCreate> {
  @override
  final Iterable<Type> types = const [AdminWaitlistCreate, _$AdminWaitlistCreate];

  @override
  final String wireName = r'AdminWaitlistCreate';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    AdminWaitlistCreate object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    yield r'email';
    yield serializers.serialize(
      object.email,
      specifiedType: const FullType(String),
    );
    if (object.source_ != null) {
      yield r'source';
      yield serializers.serialize(
        object.source_,
        specifiedType: const FullType(String),
      );
    }
    if (object.consentVersion != null) {
      yield r'consentVersion';
      yield serializers.serialize(
        object.consentVersion,
        specifiedType: const FullType(String),
      );
    }
    yield r'reasonCode';
    yield serializers.serialize(
      object.reasonCode,
      specifiedType: const FullType(String),
    );
    yield r'confirmation';
    yield serializers.serialize(
      object.confirmation,
      specifiedType: const FullType(AdminWaitlistCreateConfirmationEnum),
    );
  }

  @override
  Object serialize(
    Serializers serializers,
    AdminWaitlistCreate object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required AdminWaitlistCreateBuilder result,
    required List<Object?> unhandled,
  }) {
    for (var i = 0; i < serializedList.length; i += 2) {
      final key = serializedList[i] as String;
      final value = serializedList[i + 1];
      switch (key) {
        case r'email':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.email = valueDes;
          break;
        case r'source':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.source_ = valueDes;
          break;
        case r'consentVersion':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.consentVersion = valueDes;
          break;
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
            specifiedType: const FullType(AdminWaitlistCreateConfirmationEnum),
          ) as AdminWaitlistCreateConfirmationEnum;
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
  AdminWaitlistCreate deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = AdminWaitlistCreateBuilder();
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

class AdminWaitlistCreateConfirmationEnum extends EnumClass {

  @BuiltValueEnumConst(wireName: r'ADD WAITLIST')
  static const AdminWaitlistCreateConfirmationEnum aDDWAITLIST = _$adminWaitlistCreateConfirmationEnum_aDDWAITLIST;

  static Serializer<AdminWaitlistCreateConfirmationEnum> get serializer => _$adminWaitlistCreateConfirmationEnumSerializer;

  const AdminWaitlistCreateConfirmationEnum._(String name): super(name);

  static BuiltSet<AdminWaitlistCreateConfirmationEnum> get values => _$adminWaitlistCreateConfirmationEnumValues;
  static AdminWaitlistCreateConfirmationEnum valueOf(String name) => _$adminWaitlistCreateConfirmationEnumValueOf(name);
}
