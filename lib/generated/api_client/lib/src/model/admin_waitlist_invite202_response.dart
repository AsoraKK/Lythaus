//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:built_collection/built_collection.dart';
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'admin_waitlist_invite202_response.g.dart';

/// AdminWaitlistInvite202Response
///
/// Properties:
/// * [id]
/// * [deliveryState]
/// * [verificationState]
@BuiltValue()
abstract class AdminWaitlistInvite202Response implements Built<AdminWaitlistInvite202Response, AdminWaitlistInvite202ResponseBuilder> {
  @BuiltValueField(wireName: r'id')
  String get id;

  @BuiltValueField(wireName: r'deliveryState')
  AdminWaitlistInvite202ResponseDeliveryStateEnum get deliveryState;
  // enum deliveryStateEnum {  queued,  cooldown,  };

  @BuiltValueField(wireName: r'verificationState')
  AdminWaitlistInvite202ResponseVerificationStateEnum get verificationState;
  // enum verificationStateEnum {  pending_verification,  };

  AdminWaitlistInvite202Response._();

  factory AdminWaitlistInvite202Response([void updates(AdminWaitlistInvite202ResponseBuilder b)]) = _$AdminWaitlistInvite202Response;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(AdminWaitlistInvite202ResponseBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<AdminWaitlistInvite202Response> get serializer => _$AdminWaitlistInvite202ResponseSerializer();
}

class _$AdminWaitlistInvite202ResponseSerializer implements PrimitiveSerializer<AdminWaitlistInvite202Response> {
  @override
  final Iterable<Type> types = const [AdminWaitlistInvite202Response, _$AdminWaitlistInvite202Response];

  @override
  final String wireName = r'AdminWaitlistInvite202Response';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    AdminWaitlistInvite202Response object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    yield r'id';
    yield serializers.serialize(
      object.id,
      specifiedType: const FullType(String),
    );
    yield r'deliveryState';
    yield serializers.serialize(
      object.deliveryState,
      specifiedType: const FullType(AdminWaitlistInvite202ResponseDeliveryStateEnum),
    );
    yield r'verificationState';
    yield serializers.serialize(
      object.verificationState,
      specifiedType: const FullType(AdminWaitlistInvite202ResponseVerificationStateEnum),
    );
  }

  @override
  Object serialize(
    Serializers serializers,
    AdminWaitlistInvite202Response object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required AdminWaitlistInvite202ResponseBuilder result,
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
        case r'deliveryState':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(AdminWaitlistInvite202ResponseDeliveryStateEnum),
          ) as AdminWaitlistInvite202ResponseDeliveryStateEnum;
          result.deliveryState = valueDes;
          break;
        case r'verificationState':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(AdminWaitlistInvite202ResponseVerificationStateEnum),
          ) as AdminWaitlistInvite202ResponseVerificationStateEnum;
          result.verificationState = valueDes;
          break;
        default:
          unhandled.add(key);
          unhandled.add(value);
          break;
      }
    }
  }

  @override
  AdminWaitlistInvite202Response deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = AdminWaitlistInvite202ResponseBuilder();
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

class AdminWaitlistInvite202ResponseDeliveryStateEnum extends EnumClass {

  @BuiltValueEnumConst(wireName: r'queued')
  static const AdminWaitlistInvite202ResponseDeliveryStateEnum queued = _$adminWaitlistInvite202ResponseDeliveryStateEnum_queued;
  @BuiltValueEnumConst(wireName: r'cooldown')
  static const AdminWaitlistInvite202ResponseDeliveryStateEnum cooldown = _$adminWaitlistInvite202ResponseDeliveryStateEnum_cooldown;

  static Serializer<AdminWaitlistInvite202ResponseDeliveryStateEnum> get serializer => _$adminWaitlistInvite202ResponseDeliveryStateEnumSerializer;

  const AdminWaitlistInvite202ResponseDeliveryStateEnum._(String name): super(name);

  static BuiltSet<AdminWaitlistInvite202ResponseDeliveryStateEnum> get values => _$adminWaitlistInvite202ResponseDeliveryStateEnumValues;
  static AdminWaitlistInvite202ResponseDeliveryStateEnum valueOf(String name) => _$adminWaitlistInvite202ResponseDeliveryStateEnumValueOf(name);
}

class AdminWaitlistInvite202ResponseVerificationStateEnum extends EnumClass {

  @BuiltValueEnumConst(wireName: r'pending_verification')
  static const AdminWaitlistInvite202ResponseVerificationStateEnum pendingVerification = _$adminWaitlistInvite202ResponseVerificationStateEnum_pendingVerification;

  static Serializer<AdminWaitlistInvite202ResponseVerificationStateEnum> get serializer => _$adminWaitlistInvite202ResponseVerificationStateEnumSerializer;

  const AdminWaitlistInvite202ResponseVerificationStateEnum._(String name): super(name);

  static BuiltSet<AdminWaitlistInvite202ResponseVerificationStateEnum> get values => _$adminWaitlistInvite202ResponseVerificationStateEnumValues;
  static AdminWaitlistInvite202ResponseVerificationStateEnum valueOf(String name) => _$adminWaitlistInvite202ResponseVerificationStateEnumValueOf(name);
}
