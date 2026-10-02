//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:built_collection/built_collection.dart';
import 'package:lythaus_api_client/src/model/account_support_history_item.dart';
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'account_support_history_response.g.dart';

/// Ordered by timestamp, UUID and source, preserving PostgreSQL microsecond precision. Pagination excludes records dated after the first page's boundary, including the read's own audit. Late-arriving records with older timestamps can still appear. An empty page does not establish inactivity.
///
/// Properties:
/// * [items]
/// * [nextCursor]
/// * [snapshotAt]
/// * [coverage]
/// * [notice]
/// * [correlationId]
@BuiltValue()
abstract class AccountSupportHistoryResponse implements Built<AccountSupportHistoryResponse, AccountSupportHistoryResponseBuilder> {
  @BuiltValueField(wireName: r'items')
  BuiltList<AccountSupportHistoryItem> get items;

  @BuiltValueField(wireName: r'nextCursor')
  String? get nextCursor;

  @BuiltValueField(wireName: r'snapshotAt')
  DateTime get snapshotAt;

  @BuiltValueField(wireName: r'coverage')
  AccountSupportHistoryResponseCoverageEnum get coverage;
  // enum coverageEnum {  partial,  };

  @BuiltValueField(wireName: r'notice')
  String get notice;

  @BuiltValueField(wireName: r'correlationId')
  String get correlationId;

  AccountSupportHistoryResponse._();

  factory AccountSupportHistoryResponse([void updates(AccountSupportHistoryResponseBuilder b)]) = _$AccountSupportHistoryResponse;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(AccountSupportHistoryResponseBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<AccountSupportHistoryResponse> get serializer => _$AccountSupportHistoryResponseSerializer();
}

class _$AccountSupportHistoryResponseSerializer implements PrimitiveSerializer<AccountSupportHistoryResponse> {
  @override
  final Iterable<Type> types = const [AccountSupportHistoryResponse, _$AccountSupportHistoryResponse];

  @override
  final String wireName = r'AccountSupportHistoryResponse';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    AccountSupportHistoryResponse object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    yield r'items';
    yield serializers.serialize(
      object.items,
      specifiedType: const FullType(BuiltList, [FullType(AccountSupportHistoryItem)]),
    );
    yield r'nextCursor';
    yield object.nextCursor == null ? null : serializers.serialize(
      object.nextCursor,
      specifiedType: const FullType.nullable(String),
    );
    yield r'snapshotAt';
    yield serializers.serialize(
      object.snapshotAt,
      specifiedType: const FullType(DateTime),
    );
    yield r'coverage';
    yield serializers.serialize(
      object.coverage,
      specifiedType: const FullType(AccountSupportHistoryResponseCoverageEnum),
    );
    yield r'notice';
    yield serializers.serialize(
      object.notice,
      specifiedType: const FullType(String),
    );
    yield r'correlationId';
    yield serializers.serialize(
      object.correlationId,
      specifiedType: const FullType(String),
    );
  }

  @override
  Object serialize(
    Serializers serializers,
    AccountSupportHistoryResponse object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required AccountSupportHistoryResponseBuilder result,
    required List<Object?> unhandled,
  }) {
    for (var i = 0; i < serializedList.length; i += 2) {
      final key = serializedList[i] as String;
      final value = serializedList[i + 1];
      switch (key) {
        case r'items':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(BuiltList, [FullType(AccountSupportHistoryItem)]),
          ) as BuiltList<AccountSupportHistoryItem>;
          result.items.replace(valueDes);
          break;
        case r'nextCursor':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType.nullable(String),
          ) as String?;
          if (valueDes == null) continue;
          result.nextCursor = valueDes;
          break;
        case r'snapshotAt':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(DateTime),
          ) as DateTime;
          result.snapshotAt = valueDes;
          break;
        case r'coverage':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(AccountSupportHistoryResponseCoverageEnum),
          ) as AccountSupportHistoryResponseCoverageEnum;
          result.coverage = valueDes;
          break;
        case r'notice':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.notice = valueDes;
          break;
        case r'correlationId':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.correlationId = valueDes;
          break;
        default:
          unhandled.add(key);
          unhandled.add(value);
          break;
      }
    }
  }

  @override
  AccountSupportHistoryResponse deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = AccountSupportHistoryResponseBuilder();
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

class AccountSupportHistoryResponseCoverageEnum extends EnumClass {

  @BuiltValueEnumConst(wireName: r'partial')
  static const AccountSupportHistoryResponseCoverageEnum partial = _$accountSupportHistoryResponseCoverageEnum_partial;

  static Serializer<AccountSupportHistoryResponseCoverageEnum> get serializer => _$accountSupportHistoryResponseCoverageEnumSerializer;

  const AccountSupportHistoryResponseCoverageEnum._(String name): super(name);

  static BuiltSet<AccountSupportHistoryResponseCoverageEnum> get values => _$accountSupportHistoryResponseCoverageEnumValues;
  static AccountSupportHistoryResponseCoverageEnum valueOf(String name) => _$accountSupportHistoryResponseCoverageEnumValueOf(name);
}
