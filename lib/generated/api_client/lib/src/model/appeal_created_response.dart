//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:lythaus_api_client/src/model/appeal_created_response_appeal.dart';
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'appeal_created_response.g.dart';

/// 201 response after successfully filing a moderation appeal.
///
/// Properties:
/// * [appeal]
@BuiltValue()
abstract class AppealCreatedResponse implements Built<AppealCreatedResponse, AppealCreatedResponseBuilder> {
  @BuiltValueField(wireName: r'appeal')
  AppealCreatedResponseAppeal get appeal;

  AppealCreatedResponse._();

  factory AppealCreatedResponse([void updates(AppealCreatedResponseBuilder b)]) = _$AppealCreatedResponse;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(AppealCreatedResponseBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<AppealCreatedResponse> get serializer => _$AppealCreatedResponseSerializer();
}

class _$AppealCreatedResponseSerializer implements PrimitiveSerializer<AppealCreatedResponse> {
  @override
  final Iterable<Type> types = const [AppealCreatedResponse, _$AppealCreatedResponse];

  @override
  final String wireName = r'AppealCreatedResponse';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    AppealCreatedResponse object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    yield r'appeal';
    yield serializers.serialize(
      object.appeal,
      specifiedType: const FullType(AppealCreatedResponseAppeal),
    );
  }

  @override
  Object serialize(
    Serializers serializers,
    AppealCreatedResponse object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required AppealCreatedResponseBuilder result,
    required List<Object?> unhandled,
  }) {
    for (var i = 0; i < serializedList.length; i += 2) {
      final key = serializedList[i] as String;
      final value = serializedList[i + 1];
      switch (key) {
        case r'appeal':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(AppealCreatedResponseAppeal),
          ) as AppealCreatedResponseAppeal;
          result.appeal.replace(valueDes);
          break;
        default:
          unhandled.add(key);
          unhandled.add(value);
          break;
      }
    }
  }

  @override
  AppealCreatedResponse deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = AppealCreatedResponseBuilder();
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
