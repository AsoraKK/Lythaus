//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:lythaus_api_client/src/model/date.dart';
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'record_foreground_activity_day200_response.g.dart';

/// RecordForegroundActivityDay200Response
///
/// Properties:
/// * [activeDay]
/// * [inserted]
@BuiltValue()
abstract class RecordForegroundActivityDay200Response implements Built<RecordForegroundActivityDay200Response, RecordForegroundActivityDay200ResponseBuilder> {
  @BuiltValueField(wireName: r'activeDay')
  Date get activeDay;

  @BuiltValueField(wireName: r'inserted')
  bool get inserted;

  RecordForegroundActivityDay200Response._();

  factory RecordForegroundActivityDay200Response([void updates(RecordForegroundActivityDay200ResponseBuilder b)]) = _$RecordForegroundActivityDay200Response;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(RecordForegroundActivityDay200ResponseBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<RecordForegroundActivityDay200Response> get serializer => _$RecordForegroundActivityDay200ResponseSerializer();
}

class _$RecordForegroundActivityDay200ResponseSerializer implements PrimitiveSerializer<RecordForegroundActivityDay200Response> {
  @override
  final Iterable<Type> types = const [RecordForegroundActivityDay200Response, _$RecordForegroundActivityDay200Response];

  @override
  final String wireName = r'RecordForegroundActivityDay200Response';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    RecordForegroundActivityDay200Response object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    yield r'activeDay';
    yield serializers.serialize(
      object.activeDay,
      specifiedType: const FullType(Date),
    );
    yield r'inserted';
    yield serializers.serialize(
      object.inserted,
      specifiedType: const FullType(bool),
    );
  }

  @override
  Object serialize(
    Serializers serializers,
    RecordForegroundActivityDay200Response object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required RecordForegroundActivityDay200ResponseBuilder result,
    required List<Object?> unhandled,
  }) {
    for (var i = 0; i < serializedList.length; i += 2) {
      final key = serializedList[i] as String;
      final value = serializedList[i + 1];
      switch (key) {
        case r'activeDay':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(Date),
          ) as Date;
          result.activeDay = valueDes;
          break;
        case r'inserted':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(bool),
          ) as bool;
          result.inserted = valueDes;
          break;
        default:
          unhandled.add(key);
          unhandled.add(value);
          break;
      }
    }
  }

  @override
  RecordForegroundActivityDay200Response deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = RecordForegroundActivityDay200ResponseBuilder();
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
