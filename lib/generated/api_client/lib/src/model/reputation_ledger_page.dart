//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:lythaus_api_client/src/model/reputation_ledger_event.dart';
import 'package:built_collection/built_collection.dart';
import 'package:lythaus_api_client/src/model/cursor_page.dart';
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'reputation_ledger_page.g.dart';

/// ReputationLedgerPage
///
/// Properties:
/// * [nextCursor] - Opaque cursor for the next page, or null when exhausted.
/// * [items]
/// * [entries]
@BuiltValue()
abstract class ReputationLedgerPage implements CursorPage, Built<ReputationLedgerPage, ReputationLedgerPageBuilder> {
  @BuiltValueField(wireName: r'entries')
  BuiltList<ReputationLedgerEvent> get entries;

  @BuiltValueField(wireName: r'items')
  BuiltList<ReputationLedgerEvent> get items;

  ReputationLedgerPage._();

  factory ReputationLedgerPage([void updates(ReputationLedgerPageBuilder b)]) = _$ReputationLedgerPage;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(ReputationLedgerPageBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<ReputationLedgerPage> get serializer => _$ReputationLedgerPageSerializer();
}

class _$ReputationLedgerPageSerializer implements PrimitiveSerializer<ReputationLedgerPage> {
  @override
  final Iterable<Type> types = const [ReputationLedgerPage, _$ReputationLedgerPage];

  @override
  final String wireName = r'ReputationLedgerPage';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    ReputationLedgerPage object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    yield r'nextCursor';
    yield object.nextCursor == null ? null : serializers.serialize(
      object.nextCursor,
      specifiedType: const FullType.nullable(String),
    );
    yield r'items';
    yield serializers.serialize(
      object.items,
      specifiedType: const FullType(BuiltList, [FullType(ReputationLedgerEvent)]),
    );
    yield r'entries';
    yield serializers.serialize(
      object.entries,
      specifiedType: const FullType(BuiltList, [FullType(ReputationLedgerEvent)]),
    );
  }

  @override
  Object serialize(
    Serializers serializers,
    ReputationLedgerPage object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required ReputationLedgerPageBuilder result,
    required List<Object?> unhandled,
  }) {
    for (var i = 0; i < serializedList.length; i += 2) {
      final key = serializedList[i] as String;
      final value = serializedList[i + 1];
      switch (key) {
        case r'nextCursor':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType.nullable(String),
          ) as String?;
          if (valueDes == null) continue;
          result.nextCursor = valueDes;
          break;
        case r'items':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(BuiltList, [FullType(ReputationLedgerEvent)]),
          ) as BuiltList<ReputationLedgerEvent>;
          result.items.replace(valueDes);
          break;
        case r'entries':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(BuiltList, [FullType(ReputationLedgerEvent)]),
          ) as BuiltList<ReputationLedgerEvent>;
          result.entries.replace(valueDes);
          break;
        default:
          unhandled.add(key);
          unhandled.add(value);
          break;
      }
    }
  }

  @override
  ReputationLedgerPage deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = ReputationLedgerPageBuilder();
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
