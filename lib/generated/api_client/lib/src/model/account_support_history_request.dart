//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:built_collection/built_collection.dart';
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'account_support_history_request.g.dart';

/// AccountSupportHistoryRequest
///
/// Properties:
/// * [reasonCode] - Use a machine reason code without personal information; it is trimmed and normalized to uppercase.
/// * [source_]
/// * [eventType]
/// * [correlationId]
/// * [since] - Inclusive UTC start, with at most six fractional digits; must precede until.
/// * [until] - Exclusive UTC end, with at most six fractional digits.
/// * [order]
/// * [limit]
/// * [cursor] - Opaque keyset cursor, bound to user, filters, order and the first page's snapshot. Preserve it unchanged and keep the same filters for subsequent pages.
@BuiltValue()
abstract class AccountSupportHistoryRequest implements Built<AccountSupportHistoryRequest, AccountSupportHistoryRequestBuilder> {
  /// Use a machine reason code without personal information; it is trimmed and normalized to uppercase.
  @BuiltValueField(wireName: r'reasonCode')
  String get reasonCode;

  @BuiltValueField(wireName: r'source')
  AccountSupportHistoryRequestSource_Enum? get source_;
  // enum source_Enum {  account,  activity,  audit,  };

  @BuiltValueField(wireName: r'eventType')
  String? get eventType;

  @BuiltValueField(wireName: r'correlationId')
  String? get correlationId;

  /// Inclusive UTC start, with at most six fractional digits; must precede until.
  @BuiltValueField(wireName: r'since')
  DateTime? get since;

  /// Exclusive UTC end, with at most six fractional digits.
  @BuiltValueField(wireName: r'until')
  DateTime? get until;

  @BuiltValueField(wireName: r'order')
  AccountSupportHistoryRequestOrderEnum? get order;
  // enum orderEnum {  newest,  oldest,  };

  @BuiltValueField(wireName: r'limit')
  int? get limit;

  /// Opaque keyset cursor, bound to user, filters, order and the first page's snapshot. Preserve it unchanged and keep the same filters for subsequent pages.
  @BuiltValueField(wireName: r'cursor')
  String? get cursor;

  AccountSupportHistoryRequest._();

  factory AccountSupportHistoryRequest([void updates(AccountSupportHistoryRequestBuilder b)]) = _$AccountSupportHistoryRequest;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(AccountSupportHistoryRequestBuilder b) => b
      ..order = const AccountSupportHistoryRequestOrderEnum._('newest')
      ..limit = 25;

  @BuiltValueSerializer(custom: true)
  static Serializer<AccountSupportHistoryRequest> get serializer => _$AccountSupportHistoryRequestSerializer();
}

class _$AccountSupportHistoryRequestSerializer implements PrimitiveSerializer<AccountSupportHistoryRequest> {
  @override
  final Iterable<Type> types = const [AccountSupportHistoryRequest, _$AccountSupportHistoryRequest];

  @override
  final String wireName = r'AccountSupportHistoryRequest';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    AccountSupportHistoryRequest object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    yield r'reasonCode';
    yield serializers.serialize(
      object.reasonCode,
      specifiedType: const FullType(String),
    );
    if (object.source_ != null) {
      yield r'source';
      yield serializers.serialize(
        object.source_,
        specifiedType: const FullType(AccountSupportHistoryRequestSource_Enum),
      );
    }
    if (object.eventType != null) {
      yield r'eventType';
      yield serializers.serialize(
        object.eventType,
        specifiedType: const FullType(String),
      );
    }
    if (object.correlationId != null) {
      yield r'correlationId';
      yield serializers.serialize(
        object.correlationId,
        specifiedType: const FullType(String),
      );
    }
    if (object.since != null) {
      yield r'since';
      yield serializers.serialize(
        object.since,
        specifiedType: const FullType(DateTime),
      );
    }
    if (object.until != null) {
      yield r'until';
      yield serializers.serialize(
        object.until,
        specifiedType: const FullType(DateTime),
      );
    }
    if (object.order != null) {
      yield r'order';
      yield serializers.serialize(
        object.order,
        specifiedType: const FullType(AccountSupportHistoryRequestOrderEnum),
      );
    }
    if (object.limit != null) {
      yield r'limit';
      yield serializers.serialize(
        object.limit,
        specifiedType: const FullType(int),
      );
    }
    if (object.cursor != null) {
      yield r'cursor';
      yield serializers.serialize(
        object.cursor,
        specifiedType: const FullType(String),
      );
    }
  }

  @override
  Object serialize(
    Serializers serializers,
    AccountSupportHistoryRequest object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required AccountSupportHistoryRequestBuilder result,
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
        case r'source':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(AccountSupportHistoryRequestSource_Enum),
          ) as AccountSupportHistoryRequestSource_Enum;
          result.source_ = valueDes;
          break;
        case r'eventType':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.eventType = valueDes;
          break;
        case r'correlationId':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.correlationId = valueDes;
          break;
        case r'since':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(DateTime),
          ) as DateTime;
          result.since = valueDes;
          break;
        case r'until':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(DateTime),
          ) as DateTime;
          result.until = valueDes;
          break;
        case r'order':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(AccountSupportHistoryRequestOrderEnum),
          ) as AccountSupportHistoryRequestOrderEnum;
          result.order = valueDes;
          break;
        case r'limit':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(int),
          ) as int;
          result.limit = valueDes;
          break;
        case r'cursor':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.cursor = valueDes;
          break;
        default:
          unhandled.add(key);
          unhandled.add(value);
          break;
      }
    }
  }

  @override
  AccountSupportHistoryRequest deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = AccountSupportHistoryRequestBuilder();
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

class AccountSupportHistoryRequestSource_Enum extends EnumClass {

  @BuiltValueEnumConst(wireName: r'account')
  static const AccountSupportHistoryRequestSource_Enum account = _$accountSupportHistoryRequestSourceEnum_account;
  @BuiltValueEnumConst(wireName: r'activity')
  static const AccountSupportHistoryRequestSource_Enum activity = _$accountSupportHistoryRequestSourceEnum_activity;
  @BuiltValueEnumConst(wireName: r'audit')
  static const AccountSupportHistoryRequestSource_Enum audit = _$accountSupportHistoryRequestSourceEnum_audit;

  static Serializer<AccountSupportHistoryRequestSource_Enum> get serializer => _$accountSupportHistoryRequestSourceEnumSerializer;

  const AccountSupportHistoryRequestSource_Enum._(String name): super(name);

  static BuiltSet<AccountSupportHistoryRequestSource_Enum> get values => _$accountSupportHistoryRequestSourceEnumValues;
  static AccountSupportHistoryRequestSource_Enum valueOf(String name) => _$accountSupportHistoryRequestSourceEnumValueOf(name);
}

class AccountSupportHistoryRequestOrderEnum extends EnumClass {

  @BuiltValueEnumConst(wireName: r'newest')
  static const AccountSupportHistoryRequestOrderEnum newest = _$accountSupportHistoryRequestOrderEnum_newest;
  @BuiltValueEnumConst(wireName: r'oldest')
  static const AccountSupportHistoryRequestOrderEnum oldest = _$accountSupportHistoryRequestOrderEnum_oldest;

  static Serializer<AccountSupportHistoryRequestOrderEnum> get serializer => _$accountSupportHistoryRequestOrderEnumSerializer;

  const AccountSupportHistoryRequestOrderEnum._(String name): super(name);

  static BuiltSet<AccountSupportHistoryRequestOrderEnum> get values => _$accountSupportHistoryRequestOrderEnumValues;
  static AccountSupportHistoryRequestOrderEnum valueOf(String name) => _$accountSupportHistoryRequestOrderEnumValueOf(name);
}
