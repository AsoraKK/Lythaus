//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'admin_waitlist_invite_request.g.dart';

/// AdminWaitlistInviteRequest
///
/// Properties:
/// * [reasonCode]
/// * [confirmation] - Type SEND WAITLIST INVITE followed by the waitlist UUID.
@BuiltValue()
abstract class AdminWaitlistInviteRequest implements Built<AdminWaitlistInviteRequest, AdminWaitlistInviteRequestBuilder> {
  @BuiltValueField(wireName: r'reasonCode')
  String get reasonCode;

  /// Type SEND WAITLIST INVITE followed by the waitlist UUID.
  @BuiltValueField(wireName: r'confirmation')
  String get confirmation;

  AdminWaitlistInviteRequest._();

  factory AdminWaitlistInviteRequest([void updates(AdminWaitlistInviteRequestBuilder b)]) = _$AdminWaitlistInviteRequest;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(AdminWaitlistInviteRequestBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<AdminWaitlistInviteRequest> get serializer => _$AdminWaitlistInviteRequestSerializer();
}

class _$AdminWaitlistInviteRequestSerializer implements PrimitiveSerializer<AdminWaitlistInviteRequest> {
  @override
  final Iterable<Type> types = const [AdminWaitlistInviteRequest, _$AdminWaitlistInviteRequest];

  @override
  final String wireName = r'AdminWaitlistInviteRequest';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    AdminWaitlistInviteRequest object, {
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
    AdminWaitlistInviteRequest object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required AdminWaitlistInviteRequestBuilder result,
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
  AdminWaitlistInviteRequest deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = AdminWaitlistInviteRequestBuilder();
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
