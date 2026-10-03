//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'overview_provider_accounting_period.g.dart';

/// OverviewProviderAccountingPeriod
///
/// Properties:
/// * [start]
/// * [end]
@BuiltValue()
abstract class OverviewProviderAccountingPeriod implements Built<OverviewProviderAccountingPeriod, OverviewProviderAccountingPeriodBuilder> {
  @BuiltValueField(wireName: r'start')
  DateTime get start;

  @BuiltValueField(wireName: r'end')
  DateTime get end;

  OverviewProviderAccountingPeriod._();

  factory OverviewProviderAccountingPeriod([void updates(OverviewProviderAccountingPeriodBuilder b)]) = _$OverviewProviderAccountingPeriod;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(OverviewProviderAccountingPeriodBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<OverviewProviderAccountingPeriod> get serializer => _$OverviewProviderAccountingPeriodSerializer();
}

class _$OverviewProviderAccountingPeriodSerializer implements PrimitiveSerializer<OverviewProviderAccountingPeriod> {
  @override
  final Iterable<Type> types = const [OverviewProviderAccountingPeriod, _$OverviewProviderAccountingPeriod];

  @override
  final String wireName = r'OverviewProviderAccountingPeriod';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    OverviewProviderAccountingPeriod object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    yield r'start';
    yield serializers.serialize(
      object.start,
      specifiedType: const FullType(DateTime),
    );
    yield r'end';
    yield serializers.serialize(
      object.end,
      specifiedType: const FullType(DateTime),
    );
  }

  @override
  Object serialize(
    Serializers serializers,
    OverviewProviderAccountingPeriod object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required OverviewProviderAccountingPeriodBuilder result,
    required List<Object?> unhandled,
  }) {
    for (var i = 0; i < serializedList.length; i += 2) {
      final key = serializedList[i] as String;
      final value = serializedList[i + 1];
      switch (key) {
        case r'start':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(DateTime),
          ) as DateTime;
          result.start = valueDes;
          break;
        case r'end':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(DateTime),
          ) as DateTime;
          result.end = valueDes;
          break;
        default:
          unhandled.add(key);
          unhandled.add(value);
          break;
      }
    }
  }

  @override
  OverviewProviderAccountingPeriod deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = OverviewProviderAccountingPeriodBuilder();
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
