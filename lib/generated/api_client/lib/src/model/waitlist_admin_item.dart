//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:built_collection/built_collection.dart';
import 'package:lythaus_api_client/src/model/waitlist_admin_item_linked_account.dart';
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'waitlist_admin_item.g.dart';

/// WaitlistAdminItem
///
/// Properties:
/// * [id]
/// * [email]
/// * [status]
/// * [inviteDeliveryState]
/// * [source_]
/// * [createdAt]
/// * [invitedAt]
/// * [convertedAt]
/// * [unsubscribedAt]
/// * [retentionHold] - Whether a retention hold prevents automatic waitlist-record purging.
/// * [linkedAccount]
@BuiltValue()
abstract class WaitlistAdminItem implements Built<WaitlistAdminItem, WaitlistAdminItemBuilder> {
  @BuiltValueField(wireName: r'id')
  String get id;

  @BuiltValueField(wireName: r'email')
  String get email;

  @BuiltValueField(wireName: r'status')
  WaitlistAdminItemStatusEnum get status;
  // enum statusEnum {  waiting,  invited,  converted,  unsubscribed,  };

  @BuiltValueField(wireName: r'inviteDeliveryState')
  WaitlistAdminItemInviteDeliveryStateEnum get inviteDeliveryState;
  // enum inviteDeliveryStateEnum {  not_invited,  queued,  processing,  provider_accepted,  delivered,  deferred,  bounced,  rejected,  failed,  delivery_attention,  cancelled,  complained,  revoked,  redeemed,  expired,  };

  @BuiltValueField(wireName: r'source')
  String get source_;

  @BuiltValueField(wireName: r'createdAt')
  DateTime get createdAt;

  @BuiltValueField(wireName: r'invitedAt')
  DateTime? get invitedAt;

  @BuiltValueField(wireName: r'convertedAt')
  DateTime? get convertedAt;

  @BuiltValueField(wireName: r'unsubscribedAt')
  DateTime? get unsubscribedAt;

  /// Whether a retention hold prevents automatic waitlist-record purging.
  @BuiltValueField(wireName: r'retentionHold')
  bool get retentionHold;

  @BuiltValueField(wireName: r'linkedAccount')
  WaitlistAdminItemLinkedAccount? get linkedAccount;

  WaitlistAdminItem._();

  factory WaitlistAdminItem([void updates(WaitlistAdminItemBuilder b)]) = _$WaitlistAdminItem;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(WaitlistAdminItemBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<WaitlistAdminItem> get serializer => _$WaitlistAdminItemSerializer();
}

class _$WaitlistAdminItemSerializer implements PrimitiveSerializer<WaitlistAdminItem> {
  @override
  final Iterable<Type> types = const [WaitlistAdminItem, _$WaitlistAdminItem];

  @override
  final String wireName = r'WaitlistAdminItem';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    WaitlistAdminItem object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    yield r'id';
    yield serializers.serialize(
      object.id,
      specifiedType: const FullType(String),
    );
    yield r'email';
    yield serializers.serialize(
      object.email,
      specifiedType: const FullType(String),
    );
    yield r'status';
    yield serializers.serialize(
      object.status,
      specifiedType: const FullType(WaitlistAdminItemStatusEnum),
    );
    yield r'inviteDeliveryState';
    yield serializers.serialize(
      object.inviteDeliveryState,
      specifiedType: const FullType(WaitlistAdminItemInviteDeliveryStateEnum),
    );
    yield r'source';
    yield serializers.serialize(
      object.source_,
      specifiedType: const FullType(String),
    );
    yield r'createdAt';
    yield serializers.serialize(
      object.createdAt,
      specifiedType: const FullType(DateTime),
    );
    if (object.invitedAt != null) {
      yield r'invitedAt';
      yield serializers.serialize(
        object.invitedAt,
        specifiedType: const FullType.nullable(DateTime),
      );
    }
    if (object.convertedAt != null) {
      yield r'convertedAt';
      yield serializers.serialize(
        object.convertedAt,
        specifiedType: const FullType.nullable(DateTime),
      );
    }
    if (object.unsubscribedAt != null) {
      yield r'unsubscribedAt';
      yield serializers.serialize(
        object.unsubscribedAt,
        specifiedType: const FullType.nullable(DateTime),
      );
    }
    yield r'retentionHold';
    yield serializers.serialize(
      object.retentionHold,
      specifiedType: const FullType(bool),
    );
    if (object.linkedAccount != null) {
      yield r'linkedAccount';
      yield serializers.serialize(
        object.linkedAccount,
        specifiedType: const FullType.nullable(WaitlistAdminItemLinkedAccount),
      );
    }
  }

  @override
  Object serialize(
    Serializers serializers,
    WaitlistAdminItem object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required WaitlistAdminItemBuilder result,
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
        case r'email':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.email = valueDes;
          break;
        case r'status':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(WaitlistAdminItemStatusEnum),
          ) as WaitlistAdminItemStatusEnum;
          result.status = valueDes;
          break;
        case r'inviteDeliveryState':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(WaitlistAdminItemInviteDeliveryStateEnum),
          ) as WaitlistAdminItemInviteDeliveryStateEnum;
          result.inviteDeliveryState = valueDes;
          break;
        case r'source':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.source_ = valueDes;
          break;
        case r'createdAt':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(DateTime),
          ) as DateTime;
          result.createdAt = valueDes;
          break;
        case r'invitedAt':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType.nullable(DateTime),
          ) as DateTime?;
          if (valueDes == null) continue;
          result.invitedAt = valueDes;
          break;
        case r'convertedAt':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType.nullable(DateTime),
          ) as DateTime?;
          if (valueDes == null) continue;
          result.convertedAt = valueDes;
          break;
        case r'unsubscribedAt':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType.nullable(DateTime),
          ) as DateTime?;
          if (valueDes == null) continue;
          result.unsubscribedAt = valueDes;
          break;
        case r'retentionHold':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(bool),
          ) as bool;
          result.retentionHold = valueDes;
          break;
        case r'linkedAccount':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType.nullable(WaitlistAdminItemLinkedAccount),
          ) as WaitlistAdminItemLinkedAccount?;
          if (valueDes == null) continue;
          result.linkedAccount.replace(valueDes);
          break;
        default:
          unhandled.add(key);
          unhandled.add(value);
          break;
      }
    }
  }

  @override
  WaitlistAdminItem deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = WaitlistAdminItemBuilder();
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

class WaitlistAdminItemStatusEnum extends EnumClass {

  @BuiltValueEnumConst(wireName: r'waiting')
  static const WaitlistAdminItemStatusEnum waiting = _$waitlistAdminItemStatusEnum_waiting;
  @BuiltValueEnumConst(wireName: r'invited')
  static const WaitlistAdminItemStatusEnum invited = _$waitlistAdminItemStatusEnum_invited;
  @BuiltValueEnumConst(wireName: r'converted')
  static const WaitlistAdminItemStatusEnum converted = _$waitlistAdminItemStatusEnum_converted;
  @BuiltValueEnumConst(wireName: r'unsubscribed')
  static const WaitlistAdminItemStatusEnum unsubscribed = _$waitlistAdminItemStatusEnum_unsubscribed;

  static Serializer<WaitlistAdminItemStatusEnum> get serializer => _$waitlistAdminItemStatusEnumSerializer;

  const WaitlistAdminItemStatusEnum._(String name): super(name);

  static BuiltSet<WaitlistAdminItemStatusEnum> get values => _$waitlistAdminItemStatusEnumValues;
  static WaitlistAdminItemStatusEnum valueOf(String name) => _$waitlistAdminItemStatusEnumValueOf(name);
}

class WaitlistAdminItemInviteDeliveryStateEnum extends EnumClass {

  @BuiltValueEnumConst(wireName: r'not_invited')
  static const WaitlistAdminItemInviteDeliveryStateEnum notInvited = _$waitlistAdminItemInviteDeliveryStateEnum_notInvited;
  @BuiltValueEnumConst(wireName: r'queued')
  static const WaitlistAdminItemInviteDeliveryStateEnum queued = _$waitlistAdminItemInviteDeliveryStateEnum_queued;
  @BuiltValueEnumConst(wireName: r'processing')
  static const WaitlistAdminItemInviteDeliveryStateEnum processing = _$waitlistAdminItemInviteDeliveryStateEnum_processing;
  @BuiltValueEnumConst(wireName: r'provider_accepted')
  static const WaitlistAdminItemInviteDeliveryStateEnum providerAccepted = _$waitlistAdminItemInviteDeliveryStateEnum_providerAccepted;
  @BuiltValueEnumConst(wireName: r'delivered')
  static const WaitlistAdminItemInviteDeliveryStateEnum delivered = _$waitlistAdminItemInviteDeliveryStateEnum_delivered;
  @BuiltValueEnumConst(wireName: r'deferred')
  static const WaitlistAdminItemInviteDeliveryStateEnum deferred_ = _$waitlistAdminItemInviteDeliveryStateEnum_deferred_;
  @BuiltValueEnumConst(wireName: r'bounced')
  static const WaitlistAdminItemInviteDeliveryStateEnum bounced = _$waitlistAdminItemInviteDeliveryStateEnum_bounced;
  @BuiltValueEnumConst(wireName: r'rejected')
  static const WaitlistAdminItemInviteDeliveryStateEnum rejected = _$waitlistAdminItemInviteDeliveryStateEnum_rejected;
  @BuiltValueEnumConst(wireName: r'failed')
  static const WaitlistAdminItemInviteDeliveryStateEnum failed = _$waitlistAdminItemInviteDeliveryStateEnum_failed;
  @BuiltValueEnumConst(wireName: r'delivery_attention')
  static const WaitlistAdminItemInviteDeliveryStateEnum deliveryAttention = _$waitlistAdminItemInviteDeliveryStateEnum_deliveryAttention;
  @BuiltValueEnumConst(wireName: r'cancelled')
  static const WaitlistAdminItemInviteDeliveryStateEnum cancelled = _$waitlistAdminItemInviteDeliveryStateEnum_cancelled;
  @BuiltValueEnumConst(wireName: r'complained')
  static const WaitlistAdminItemInviteDeliveryStateEnum complained = _$waitlistAdminItemInviteDeliveryStateEnum_complained;
  @BuiltValueEnumConst(wireName: r'revoked')
  static const WaitlistAdminItemInviteDeliveryStateEnum revoked = _$waitlistAdminItemInviteDeliveryStateEnum_revoked;
  @BuiltValueEnumConst(wireName: r'redeemed')
  static const WaitlistAdminItemInviteDeliveryStateEnum redeemed = _$waitlistAdminItemInviteDeliveryStateEnum_redeemed;
  @BuiltValueEnumConst(wireName: r'expired')
  static const WaitlistAdminItemInviteDeliveryStateEnum expired = _$waitlistAdminItemInviteDeliveryStateEnum_expired;

  static Serializer<WaitlistAdminItemInviteDeliveryStateEnum> get serializer => _$waitlistAdminItemInviteDeliveryStateEnumSerializer;

  const WaitlistAdminItemInviteDeliveryStateEnum._(String name): super(name);

  static BuiltSet<WaitlistAdminItemInviteDeliveryStateEnum> get values => _$waitlistAdminItemInviteDeliveryStateEnumValues;
  static WaitlistAdminItemInviteDeliveryStateEnum valueOf(String name) => _$waitlistAdminItemInviteDeliveryStateEnumValueOf(name);
}
