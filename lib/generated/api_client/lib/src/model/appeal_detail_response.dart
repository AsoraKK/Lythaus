//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:lythaus_api_client/src/model/appeal_detail.dart';
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'appeal_detail_response.g.dart';

/// AppealDetailResponse
///
/// Properties:
/// * [appeal]
@BuiltValue()
abstract class AppealDetailResponse implements Built<AppealDetailResponse, AppealDetailResponseBuilder> {
  @BuiltValueField(wireName: r'appeal')
  AppealDetail get appeal;

  AppealDetailResponse._();

  factory AppealDetailResponse([void updates(AppealDetailResponseBuilder b)]) = _$AppealDetailResponse;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(AppealDetailResponseBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<AppealDetailResponse> get serializer => _$AppealDetailResponseSerializer();
}

class _$AppealDetailResponseSerializer implements PrimitiveSerializer<AppealDetailResponse> {
  @override
  final Iterable<Type> types = const [AppealDetailResponse, _$AppealDetailResponse];

  @override
  final String wireName = r'AppealDetailResponse';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    AppealDetailResponse object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    yield r'appeal';
    yield serializers.serialize(
      object.appeal,
      specifiedType: const FullType(AppealDetail),
    );
  }

  @override
  Object serialize(
    Serializers serializers,
    AppealDetailResponse object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required AppealDetailResponseBuilder result,
    required List<Object?> unhandled,
  }) {
    for (var i = 0; i < serializedList.length; i += 2) {
      final key = serializedList[i] as String;
      final value = serializedList[i + 1];
      switch (key) {
        case r'appeal':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(AppealDetail),
          ) as AppealDetail;
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
  AppealDetailResponse deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = AppealDetailResponseBuilder();
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
