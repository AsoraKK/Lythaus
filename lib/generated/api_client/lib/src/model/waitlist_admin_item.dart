//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:built_collection/built_collection.dart';
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'waitlist_admin_item.g.dart';

/// WaitlistAdminItem
///
/// Properties:
/// * [id]
/// * [email]
/// * [status]
/// * [source_]
/// * [createdAt]
/// * [retentionHold] - Whether a retention hold prevents automatic waitlist-record purging.
@BuiltValue()
abstract class WaitlistAdminItem implements Built<WaitlistAdminItem, WaitlistAdminItemBuilder> {
  @BuiltValueField(wireName: r'id')
  String get id;

  @BuiltValueField(wireName: r'email')
  String get email;

  @BuiltValueField(wireName: r'status')
  WaitlistAdminItemStatusEnum get status;
  // enum statusEnum {  waiting,  invited,  converted,  unsubscribed,  };

  @BuiltValueField(wireName: r'source')
  String get source_;

  @BuiltValueField(wireName: r'createdAt')
  DateTime get createdAt;

  /// Whether a retention hold prevents automatic waitlist-record purging.
  @BuiltValueField(wireName: r'retentionHold')
  bool get retentionHold;

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
    yield r'retentionHold';
    yield serializers.serialize(
      object.retentionHold,
      specifiedType: const FullType(bool),
    );
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
        case r'retentionHold':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(bool),
          ) as bool;
          result.retentionHold = valueDes;
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
