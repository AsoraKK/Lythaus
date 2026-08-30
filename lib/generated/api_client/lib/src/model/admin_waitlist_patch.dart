//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:built_collection/built_collection.dart';
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'admin_waitlist_patch.g.dart';

/// AdminWaitlistPatch
///
/// Properties:
/// * [status]
/// * [source_]
/// * [reasonCode]
/// * [confirmation]
@BuiltValue()
abstract class AdminWaitlistPatch implements Built<AdminWaitlistPatch, AdminWaitlistPatchBuilder> {
  @BuiltValueField(wireName: r'status')
  AdminWaitlistPatchStatusEnum? get status;
  // enum statusEnum {  invited,  converted,  unsubscribed,  };

  @BuiltValueField(wireName: r'source')
  String? get source_;

  @BuiltValueField(wireName: r'reasonCode')
  String get reasonCode;

  @BuiltValueField(wireName: r'confirmation')
  AdminWaitlistPatchConfirmationEnum get confirmation;
  // enum confirmationEnum {  UPDATE WAITLIST,  };

  AdminWaitlistPatch._();

  factory AdminWaitlistPatch([void updates(AdminWaitlistPatchBuilder b)]) = _$AdminWaitlistPatch;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(AdminWaitlistPatchBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<AdminWaitlistPatch> get serializer => _$AdminWaitlistPatchSerializer();
}

class _$AdminWaitlistPatchSerializer implements PrimitiveSerializer<AdminWaitlistPatch> {
  @override
  final Iterable<Type> types = const [AdminWaitlistPatch, _$AdminWaitlistPatch];

  @override
  final String wireName = r'AdminWaitlistPatch';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    AdminWaitlistPatch object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    if (object.status != null) {
      yield r'status';
      yield serializers.serialize(
        object.status,
        specifiedType: const FullType(AdminWaitlistPatchStatusEnum),
      );
    }
    if (object.source_ != null) {
      yield r'source';
      yield serializers.serialize(
        object.source_,
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
      specifiedType: const FullType(AdminWaitlistPatchConfirmationEnum),
    );
  }

  @override
  Object serialize(
    Serializers serializers,
    AdminWaitlistPatch object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required AdminWaitlistPatchBuilder result,
    required List<Object?> unhandled,
  }) {
    for (var i = 0; i < serializedList.length; i += 2) {
      final key = serializedList[i] as String;
      final value = serializedList[i + 1];
      switch (key) {
        case r'status':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(AdminWaitlistPatchStatusEnum),
          ) as AdminWaitlistPatchStatusEnum;
          result.status = valueDes;
          break;
        case r'source':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.source_ = valueDes;
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
            specifiedType: const FullType(AdminWaitlistPatchConfirmationEnum),
          ) as AdminWaitlistPatchConfirmationEnum;
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
  AdminWaitlistPatch deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = AdminWaitlistPatchBuilder();
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

class AdminWaitlistPatchStatusEnum extends EnumClass {

  @BuiltValueEnumConst(wireName: r'invited')
  static const AdminWaitlistPatchStatusEnum invited = _$adminWaitlistPatchStatusEnum_invited;
  @BuiltValueEnumConst(wireName: r'converted')
  static const AdminWaitlistPatchStatusEnum converted = _$adminWaitlistPatchStatusEnum_converted;
  @BuiltValueEnumConst(wireName: r'unsubscribed')
  static const AdminWaitlistPatchStatusEnum unsubscribed = _$adminWaitlistPatchStatusEnum_unsubscribed;

  static Serializer<AdminWaitlistPatchStatusEnum> get serializer => _$adminWaitlistPatchStatusEnumSerializer;

  const AdminWaitlistPatchStatusEnum._(String name): super(name);

  static BuiltSet<AdminWaitlistPatchStatusEnum> get values => _$adminWaitlistPatchStatusEnumValues;
  static AdminWaitlistPatchStatusEnum valueOf(String name) => _$adminWaitlistPatchStatusEnumValueOf(name);
}

class AdminWaitlistPatchConfirmationEnum extends EnumClass {

  @BuiltValueEnumConst(wireName: r'UPDATE WAITLIST')
  static const AdminWaitlistPatchConfirmationEnum uPDATEWAITLIST = _$adminWaitlistPatchConfirmationEnum_uPDATEWAITLIST;

  static Serializer<AdminWaitlistPatchConfirmationEnum> get serializer => _$adminWaitlistPatchConfirmationEnumSerializer;

  const AdminWaitlistPatchConfirmationEnum._(String name): super(name);

  static BuiltSet<AdminWaitlistPatchConfirmationEnum> get values => _$adminWaitlistPatchConfirmationEnumValues;
  static AdminWaitlistPatchConfirmationEnum valueOf(String name) => _$adminWaitlistPatchConfirmationEnumValueOf(name);
}
