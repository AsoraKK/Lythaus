//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:built_collection/built_collection.dart';
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'safety_limit_error.g.dart';

/// Stable, neutral anti-abuse limit response. No user-supplied content or detector result is disclosed.
///
/// Properties:
/// * [error]
/// * [correlationId]
@BuiltValue()
abstract class SafetyLimitError implements Built<SafetyLimitError, SafetyLimitErrorBuilder> {
  @BuiltValueField(wireName: r'error')
  SafetyLimitErrorErrorEnum get error;
  // enum errorEnum {  rate_limit_exceeded,  post_daily_limit_reached,  comment_daily_limit_reached,  reaction_daily_limit_reached,  appeal_daily_limit_reached,  flag_daily_limit_reached,  media_daily_limit_reached,  relationship_change_limit_reached,  export_cooldown_active,  privacy_request_active,  };

  @BuiltValueField(wireName: r'correlationId')
  String get correlationId;

  SafetyLimitError._();

  factory SafetyLimitError([void updates(SafetyLimitErrorBuilder b)]) = _$SafetyLimitError;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(SafetyLimitErrorBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<SafetyLimitError> get serializer => _$SafetyLimitErrorSerializer();
}

class _$SafetyLimitErrorSerializer implements PrimitiveSerializer<SafetyLimitError> {
  @override
  final Iterable<Type> types = const [SafetyLimitError, _$SafetyLimitError];

  @override
  final String wireName = r'SafetyLimitError';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    SafetyLimitError object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    yield r'error';
    yield serializers.serialize(
      object.error,
      specifiedType: const FullType(SafetyLimitErrorErrorEnum),
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
    SafetyLimitError object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required SafetyLimitErrorBuilder result,
    required List<Object?> unhandled,
  }) {
    for (var i = 0; i < serializedList.length; i += 2) {
      final key = serializedList[i] as String;
      final value = serializedList[i + 1];
      switch (key) {
        case r'error':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(SafetyLimitErrorErrorEnum),
          ) as SafetyLimitErrorErrorEnum;
          result.error = valueDes;
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
  SafetyLimitError deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = SafetyLimitErrorBuilder();
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

class SafetyLimitErrorErrorEnum extends EnumClass {

  @BuiltValueEnumConst(wireName: r'rate_limit_exceeded')
  static const SafetyLimitErrorErrorEnum rateLimitExceeded = _$safetyLimitErrorErrorEnum_rateLimitExceeded;
  @BuiltValueEnumConst(wireName: r'post_daily_limit_reached')
  static const SafetyLimitErrorErrorEnum postDailyLimitReached = _$safetyLimitErrorErrorEnum_postDailyLimitReached;
  @BuiltValueEnumConst(wireName: r'comment_daily_limit_reached')
  static const SafetyLimitErrorErrorEnum commentDailyLimitReached = _$safetyLimitErrorErrorEnum_commentDailyLimitReached;
  @BuiltValueEnumConst(wireName: r'reaction_daily_limit_reached')
  static const SafetyLimitErrorErrorEnum reactionDailyLimitReached = _$safetyLimitErrorErrorEnum_reactionDailyLimitReached;
  @BuiltValueEnumConst(wireName: r'appeal_daily_limit_reached')
  static const SafetyLimitErrorErrorEnum appealDailyLimitReached = _$safetyLimitErrorErrorEnum_appealDailyLimitReached;
  @BuiltValueEnumConst(wireName: r'flag_daily_limit_reached')
  static const SafetyLimitErrorErrorEnum flagDailyLimitReached = _$safetyLimitErrorErrorEnum_flagDailyLimitReached;
  @BuiltValueEnumConst(wireName: r'media_daily_limit_reached')
  static const SafetyLimitErrorErrorEnum mediaDailyLimitReached = _$safetyLimitErrorErrorEnum_mediaDailyLimitReached;
  @BuiltValueEnumConst(wireName: r'relationship_change_limit_reached')
  static const SafetyLimitErrorErrorEnum relationshipChangeLimitReached = _$safetyLimitErrorErrorEnum_relationshipChangeLimitReached;
  @BuiltValueEnumConst(wireName: r'export_cooldown_active')
  static const SafetyLimitErrorErrorEnum exportCooldownActive = _$safetyLimitErrorErrorEnum_exportCooldownActive;
  @BuiltValueEnumConst(wireName: r'privacy_request_active')
  static const SafetyLimitErrorErrorEnum privacyRequestActive = _$safetyLimitErrorErrorEnum_privacyRequestActive;

  static Serializer<SafetyLimitErrorErrorEnum> get serializer => _$safetyLimitErrorErrorEnumSerializer;

  const SafetyLimitErrorErrorEnum._(String name): super(name);

  static BuiltSet<SafetyLimitErrorErrorEnum> get values => _$safetyLimitErrorErrorEnumValues;
  static SafetyLimitErrorErrorEnum valueOf(String name) => _$safetyLimitErrorErrorEnumValueOf(name);
}
