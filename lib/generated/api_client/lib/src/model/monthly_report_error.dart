//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:built_collection/built_collection.dart';
import 'package:built_value/json_object.dart';
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'monthly_report_error.g.dart';

/// MonthlyReportError
///
/// Properties:
/// * [error]
@BuiltValue()
abstract class MonthlyReportError implements Built<MonthlyReportError, MonthlyReportErrorBuilder> {
  @BuiltValueField(wireName: r'error')
  String get error;

  MonthlyReportError._();

  factory MonthlyReportError([void updates(MonthlyReportErrorBuilder b)]) = _$MonthlyReportError;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(MonthlyReportErrorBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<MonthlyReportError> get serializer => _$MonthlyReportErrorSerializer();
}

class _$MonthlyReportErrorSerializer implements PrimitiveSerializer<MonthlyReportError> {
  @override
  final Iterable<Type> types = const [MonthlyReportError, _$MonthlyReportError];

  @override
  final String wireName = r'MonthlyReportError';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    MonthlyReportError object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    yield r'error';
    yield serializers.serialize(
      object.error,
      specifiedType: const FullType(String),
    );
  }

  @override
  Object serialize(
    Serializers serializers,
    MonthlyReportError object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required MonthlyReportErrorBuilder result,
    required List<Object?> unhandled,
  }) {
    for (var i = 0; i < serializedList.length; i += 2) {
      final key = serializedList[i] as String;
      final value = serializedList[i + 1];
      switch (key) {
        case r'error':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.error = valueDes;
          break;
        default:
          unhandled.add(key);
          unhandled.add(value);
          break;
      }
    }
  }

  @override
  MonthlyReportError deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = MonthlyReportErrorBuilder();
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
