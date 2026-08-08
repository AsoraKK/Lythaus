//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:lythaus_api_client/src/model/ledger_entry.dart';
import 'package:built_collection/built_collection.dart';
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'ledger_page.g.dart';

/// LedgerPage
///
/// Properties:
/// * [entries]
/// * [nextCursor]
@BuiltValue()
abstract class LedgerPage implements Built<LedgerPage, LedgerPageBuilder> {
  @BuiltValueField(wireName: r'entries')
  BuiltList<LedgerEntry> get entries;

  @BuiltValueField(wireName: r'nextCursor')
  String? get nextCursor;

  LedgerPage._();

  factory LedgerPage([void updates(LedgerPageBuilder b)]) = _$LedgerPage;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(LedgerPageBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<LedgerPage> get serializer => _$LedgerPageSerializer();
}

class _$LedgerPageSerializer implements PrimitiveSerializer<LedgerPage> {
  @override
  final Iterable<Type> types = const [LedgerPage, _$LedgerPage];

  @override
  final String wireName = r'LedgerPage';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    LedgerPage object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    yield r'entries';
    yield serializers.serialize(
      object.entries,
      specifiedType: const FullType(BuiltList, [FullType(LedgerEntry)]),
    );
    if (object.nextCursor != null) {
      yield r'nextCursor';
      yield serializers.serialize(
        object.nextCursor,
        specifiedType: const FullType(String),
      );
    }
  }

  @override
  Object serialize(
    Serializers serializers,
    LedgerPage object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required LedgerPageBuilder result,
    required List<Object?> unhandled,
  }) {
    for (var i = 0; i < serializedList.length; i += 2) {
      final key = serializedList[i] as String;
      final value = serializedList[i + 1];
      switch (key) {
        case r'entries':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(BuiltList, [FullType(LedgerEntry)]),
          ) as BuiltList<LedgerEntry>;
          result.entries.replace(valueDes);
          break;
        case r'nextCursor':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.nextCursor = valueDes;
          break;
        default:
          unhandled.add(key);
          unhandled.add(value);
          break;
      }
    }
  }

  @override
  LedgerPage deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = LedgerPageBuilder();
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
