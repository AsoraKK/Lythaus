//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:built_collection/built_collection.dart';
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'account_support_history_item.g.dart';

/// AccountSupportHistoryItem
///
/// Properties:
/// * [id]
/// * [source_]
/// * [eventType]
/// * [createdAt]
/// * [correlationId]
/// * [reasonCode]
/// * [category]
/// * [outcome]
@BuiltValue()
abstract class AccountSupportHistoryItem implements Built<AccountSupportHistoryItem, AccountSupportHistoryItemBuilder> {
  @BuiltValueField(wireName: r'id')
  String get id;

  @BuiltValueField(wireName: r'source')
  AccountSupportHistoryItemSource_Enum get source_;
  // enum source_Enum {  account,  activity,  audit,  };

  @BuiltValueField(wireName: r'eventType')
  String get eventType;

  @BuiltValueField(wireName: r'createdAt')
  DateTime get createdAt;

  @BuiltValueField(wireName: r'correlationId')
  String? get correlationId;

  @BuiltValueField(wireName: r'reasonCode')
  String? get reasonCode;

  @BuiltValueField(wireName: r'category')
  String? get category;

  @BuiltValueField(wireName: r'outcome')
  String? get outcome;

  AccountSupportHistoryItem._();

  factory AccountSupportHistoryItem([void updates(AccountSupportHistoryItemBuilder b)]) = _$AccountSupportHistoryItem;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(AccountSupportHistoryItemBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<AccountSupportHistoryItem> get serializer => _$AccountSupportHistoryItemSerializer();
}

class _$AccountSupportHistoryItemSerializer implements PrimitiveSerializer<AccountSupportHistoryItem> {
  @override
  final Iterable<Type> types = const [AccountSupportHistoryItem, _$AccountSupportHistoryItem];

  @override
  final String wireName = r'AccountSupportHistoryItem';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    AccountSupportHistoryItem object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    yield r'id';
    yield serializers.serialize(
      object.id,
      specifiedType: const FullType(String),
    );
    yield r'source';
    yield serializers.serialize(
      object.source_,
      specifiedType: const FullType(AccountSupportHistoryItemSource_Enum),
    );
    yield r'eventType';
    yield serializers.serialize(
      object.eventType,
      specifiedType: const FullType(String),
    );
    yield r'createdAt';
    yield serializers.serialize(
      object.createdAt,
      specifiedType: const FullType(DateTime),
    );
    yield r'correlationId';
    yield object.correlationId == null ? null : serializers.serialize(
      object.correlationId,
      specifiedType: const FullType.nullable(String),
    );
    yield r'reasonCode';
    yield object.reasonCode == null ? null : serializers.serialize(
      object.reasonCode,
      specifiedType: const FullType.nullable(String),
    );
    yield r'category';
    yield object.category == null ? null : serializers.serialize(
      object.category,
      specifiedType: const FullType.nullable(String),
    );
    yield r'outcome';
    yield object.outcome == null ? null : serializers.serialize(
      object.outcome,
      specifiedType: const FullType.nullable(String),
    );
  }

  @override
  Object serialize(
    Serializers serializers,
    AccountSupportHistoryItem object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required AccountSupportHistoryItemBuilder result,
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
        case r'source':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(AccountSupportHistoryItemSource_Enum),
          ) as AccountSupportHistoryItemSource_Enum;
          result.source_ = valueDes;
          break;
        case r'eventType':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.eventType = valueDes;
          break;
        case r'createdAt':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(DateTime),
          ) as DateTime;
          result.createdAt = valueDes;
          break;
        case r'correlationId':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType.nullable(String),
          ) as String?;
          if (valueDes == null) continue;
          result.correlationId = valueDes;
          break;
        case r'reasonCode':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType.nullable(String),
          ) as String?;
          if (valueDes == null) continue;
          result.reasonCode = valueDes;
          break;
        case r'category':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType.nullable(String),
          ) as String?;
          if (valueDes == null) continue;
          result.category = valueDes;
          break;
        case r'outcome':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType.nullable(String),
          ) as String?;
          if (valueDes == null) continue;
          result.outcome = valueDes;
          break;
        default:
          unhandled.add(key);
          unhandled.add(value);
          break;
      }
    }
  }

  @override
  AccountSupportHistoryItem deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = AccountSupportHistoryItemBuilder();
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

class AccountSupportHistoryItemSource_Enum extends EnumClass {

  @BuiltValueEnumConst(wireName: r'account')
  static const AccountSupportHistoryItemSource_Enum account = _$accountSupportHistoryItemSourceEnum_account;
  @BuiltValueEnumConst(wireName: r'activity')
  static const AccountSupportHistoryItemSource_Enum activity = _$accountSupportHistoryItemSourceEnum_activity;
  @BuiltValueEnumConst(wireName: r'audit')
  static const AccountSupportHistoryItemSource_Enum audit = _$accountSupportHistoryItemSourceEnum_audit;

  static Serializer<AccountSupportHistoryItemSource_Enum> get serializer => _$accountSupportHistoryItemSourceEnumSerializer;

  const AccountSupportHistoryItemSource_Enum._(String name): super(name);

  static BuiltSet<AccountSupportHistoryItemSource_Enum> get values => _$accountSupportHistoryItemSourceEnumValues;
  static AccountSupportHistoryItemSource_Enum valueOf(String name) => _$accountSupportHistoryItemSourceEnumValueOf(name);
}
