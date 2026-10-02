//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'overview_window.g.dart';

/// OverviewWindow
///
/// Properties:
/// * [start]
/// * [end]
@BuiltValue()
abstract class OverviewWindow implements Built<OverviewWindow, OverviewWindowBuilder> {
  @BuiltValueField(wireName: r'start')
  DateTime get start;

  @BuiltValueField(wireName: r'end')
  DateTime get end;

  OverviewWindow._();

  factory OverviewWindow([void updates(OverviewWindowBuilder b)]) = _$OverviewWindow;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(OverviewWindowBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<OverviewWindow> get serializer => _$OverviewWindowSerializer();
}

class _$OverviewWindowSerializer implements PrimitiveSerializer<OverviewWindow> {
  @override
  final Iterable<Type> types = const [OverviewWindow, _$OverviewWindow];

  @override
  final String wireName = r'OverviewWindow';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    OverviewWindow object, {
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
    OverviewWindow object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required OverviewWindowBuilder result,
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
  OverviewWindow deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = OverviewWindowBuilder();
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
