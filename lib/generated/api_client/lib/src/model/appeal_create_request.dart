//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'appeal_create_request.g.dart';

/// The caller may appeal a resolved case for their post or comment, or an account case where the case content ID is the caller's user ID.
///
/// Properties:
/// * [caseId]
/// * [statement]
@BuiltValue()
abstract class AppealCreateRequest implements Built<AppealCreateRequest, AppealCreateRequestBuilder> {
  @BuiltValueField(wireName: r'caseId')
  String get caseId;

  @BuiltValueField(wireName: r'statement')
  String get statement;

  AppealCreateRequest._();

  factory AppealCreateRequest([void updates(AppealCreateRequestBuilder b)]) = _$AppealCreateRequest;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(AppealCreateRequestBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<AppealCreateRequest> get serializer => _$AppealCreateRequestSerializer();
}

class _$AppealCreateRequestSerializer implements PrimitiveSerializer<AppealCreateRequest> {
  @override
  final Iterable<Type> types = const [AppealCreateRequest, _$AppealCreateRequest];

  @override
  final String wireName = r'AppealCreateRequest';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    AppealCreateRequest object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    yield r'caseId';
    yield serializers.serialize(
      object.caseId,
      specifiedType: const FullType(String),
    );
    yield r'statement';
    yield serializers.serialize(
      object.statement,
      specifiedType: const FullType(String),
    );
  }

  @override
  Object serialize(
    Serializers serializers,
    AppealCreateRequest object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required AppealCreateRequestBuilder result,
    required List<Object?> unhandled,
  }) {
    for (var i = 0; i < serializedList.length; i += 2) {
      final key = serializedList[i] as String;
      final value = serializedList[i + 1];
      switch (key) {
        case r'caseId':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.caseId = valueDes;
          break;
        case r'statement':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.statement = valueDes;
          break;
        default:
          unhandled.add(key);
          unhandled.add(value);
          break;
      }
    }
  }

  @override
  AppealCreateRequest deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = AppealCreateRequestBuilder();
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
