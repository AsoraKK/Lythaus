//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:built_collection/built_collection.dart';
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'admin_user_profile_patch.g.dart';

/// AdminUserProfilePatch
///
/// Properties:
/// * [displayName]
/// * [handle]
/// * [reasonCode]
/// * [confirmation]
@BuiltValue()
abstract class AdminUserProfilePatch implements Built<AdminUserProfilePatch, AdminUserProfilePatchBuilder> {
  @BuiltValueField(wireName: r'displayName')
  String? get displayName;

  @BuiltValueField(wireName: r'handle')
  String? get handle;

  @BuiltValueField(wireName: r'reasonCode')
  String get reasonCode;

  @BuiltValueField(wireName: r'confirmation')
  AdminUserProfilePatchConfirmationEnum get confirmation;
  // enum confirmationEnum {  UPDATE PROFILE,  };

  AdminUserProfilePatch._();

  factory AdminUserProfilePatch([void updates(AdminUserProfilePatchBuilder b)]) = _$AdminUserProfilePatch;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(AdminUserProfilePatchBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<AdminUserProfilePatch> get serializer => _$AdminUserProfilePatchSerializer();
}

class _$AdminUserProfilePatchSerializer implements PrimitiveSerializer<AdminUserProfilePatch> {
  @override
  final Iterable<Type> types = const [AdminUserProfilePatch, _$AdminUserProfilePatch];

  @override
  final String wireName = r'AdminUserProfilePatch';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    AdminUserProfilePatch object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    if (object.displayName != null) {
      yield r'displayName';
      yield serializers.serialize(
        object.displayName,
        specifiedType: const FullType(String),
      );
    }
    if (object.handle != null) {
      yield r'handle';
      yield serializers.serialize(
        object.handle,
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
      specifiedType: const FullType(AdminUserProfilePatchConfirmationEnum),
    );
  }

  @override
  Object serialize(
    Serializers serializers,
    AdminUserProfilePatch object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required AdminUserProfilePatchBuilder result,
    required List<Object?> unhandled,
  }) {
    for (var i = 0; i < serializedList.length; i += 2) {
      final key = serializedList[i] as String;
      final value = serializedList[i + 1];
      switch (key) {
        case r'displayName':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.displayName = valueDes;
          break;
        case r'handle':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.handle = valueDes;
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
            specifiedType: const FullType(AdminUserProfilePatchConfirmationEnum),
          ) as AdminUserProfilePatchConfirmationEnum;
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
  AdminUserProfilePatch deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = AdminUserProfilePatchBuilder();
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

class AdminUserProfilePatchConfirmationEnum extends EnumClass {

  @BuiltValueEnumConst(wireName: r'UPDATE PROFILE')
  static const AdminUserProfilePatchConfirmationEnum uPDATEPROFILE = _$adminUserProfilePatchConfirmationEnum_uPDATEPROFILE;

  static Serializer<AdminUserProfilePatchConfirmationEnum> get serializer => _$adminUserProfilePatchConfirmationEnumSerializer;

  const AdminUserProfilePatchConfirmationEnum._(String name): super(name);

  static BuiltSet<AdminUserProfilePatchConfirmationEnum> get values => _$adminUserProfilePatchConfirmationEnumValues;
  static AdminUserProfilePatchConfirmationEnum valueOf(String name) => _$adminUserProfilePatchConfirmationEnumValueOf(name);
}
