//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:lythaus_api_client/src/model/privacy_request.dart';
import 'package:built_collection/built_collection.dart';
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'privacy_request_accepted.g.dart';

/// PrivacyRequestAccepted
///
/// Properties:
/// * [requestId]
/// * [requestType]
/// * [state]
/// * [acceptedAt]
/// * [completedAt]
@BuiltValue()
abstract class PrivacyRequestAccepted implements PrivacyRequest, Built<PrivacyRequestAccepted, PrivacyRequestAcceptedBuilder> {
  PrivacyRequestAccepted._();

  factory PrivacyRequestAccepted([void updates(PrivacyRequestAcceptedBuilder b)]) = _$PrivacyRequestAccepted;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(PrivacyRequestAcceptedBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<PrivacyRequestAccepted> get serializer => _$PrivacyRequestAcceptedSerializer();
}

class _$PrivacyRequestAcceptedSerializer implements PrimitiveSerializer<PrivacyRequestAccepted> {
  @override
  final Iterable<Type> types = const [PrivacyRequestAccepted, _$PrivacyRequestAccepted];

  @override
  final String wireName = r'PrivacyRequestAccepted';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    PrivacyRequestAccepted object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    if (object.completedAt != null) {
      yield r'completedAt';
      yield serializers.serialize(
        object.completedAt,
        specifiedType: const FullType.nullable(DateTime),
      );
    }
    yield r'state';
    yield serializers.serialize(
      object.state,
      specifiedType: const FullType(PrivacyRequestStateEnum),
    );
    yield r'requestType';
    yield serializers.serialize(
      object.requestType,
      specifiedType: const FullType(PrivacyRequestRequestTypeEnum),
    );
    yield r'requestId';
    yield serializers.serialize(
      object.requestId,
      specifiedType: const FullType(String),
    );
    yield r'acceptedAt';
    yield serializers.serialize(
      object.acceptedAt,
      specifiedType: const FullType(DateTime),
    );
  }

  @override
  Object serialize(
    Serializers serializers,
    PrivacyRequestAccepted object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required PrivacyRequestAcceptedBuilder result,
    required List<Object?> unhandled,
  }) {
    for (var i = 0; i < serializedList.length; i += 2) {
      final key = serializedList[i] as String;
      final value = serializedList[i + 1];
      switch (key) {
        case r'completedAt':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType.nullable(DateTime),
          ) as DateTime?;
          if (valueDes == null) continue;
          result.completedAt = valueDes;
          break;
        case r'state':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(PrivacyRequestStateEnum),
          ) as PrivacyRequestStateEnum;
          result.state = valueDes;
          break;
        case r'requestType':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(PrivacyRequestRequestTypeEnum),
          ) as PrivacyRequestRequestTypeEnum;
          result.requestType = valueDes;
          break;
        case r'requestId':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.requestId = valueDes;
          break;
        case r'acceptedAt':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(DateTime),
          ) as DateTime;
          result.acceptedAt = valueDes;
          break;
        default:
          unhandled.add(key);
          unhandled.add(value);
          break;
      }
    }
  }

  @override
  PrivacyRequestAccepted deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = PrivacyRequestAcceptedBuilder();
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

class PrivacyRequestAcceptedRequestTypeEnum extends EnumClass {

  @BuiltValueEnumConst(wireName: r'export')
  static const PrivacyRequestAcceptedRequestTypeEnum export_ = _$privacyRequestAcceptedRequestTypeEnum_export_;
  @BuiltValueEnumConst(wireName: r'delete')
  static const PrivacyRequestAcceptedRequestTypeEnum delete = _$privacyRequestAcceptedRequestTypeEnum_delete;
  @BuiltValueEnumConst(wireName: r'rectify')
  static const PrivacyRequestAcceptedRequestTypeEnum rectify = _$privacyRequestAcceptedRequestTypeEnum_rectify;

  static Serializer<PrivacyRequestAcceptedRequestTypeEnum> get serializer => _$privacyRequestAcceptedRequestTypeEnumSerializer;

  const PrivacyRequestAcceptedRequestTypeEnum._(String name): super(name);

  static BuiltSet<PrivacyRequestAcceptedRequestTypeEnum> get values => _$privacyRequestAcceptedRequestTypeEnumValues;
  static PrivacyRequestAcceptedRequestTypeEnum valueOf(String name) => _$privacyRequestAcceptedRequestTypeEnumValueOf(name);
}

class PrivacyRequestAcceptedStateEnum extends EnumClass {

  @BuiltValueEnumConst(wireName: r'received')
  static const PrivacyRequestAcceptedStateEnum received = _$privacyRequestAcceptedStateEnum_received;
  @BuiltValueEnumConst(wireName: r'processing')
  static const PrivacyRequestAcceptedStateEnum processing = _$privacyRequestAcceptedStateEnum_processing;
  @BuiltValueEnumConst(wireName: r'blocked')
  static const PrivacyRequestAcceptedStateEnum blocked = _$privacyRequestAcceptedStateEnum_blocked;
  @BuiltValueEnumConst(wireName: r'completed')
  static const PrivacyRequestAcceptedStateEnum completed = _$privacyRequestAcceptedStateEnum_completed;
  @BuiltValueEnumConst(wireName: r'failed')
  static const PrivacyRequestAcceptedStateEnum failed = _$privacyRequestAcceptedStateEnum_failed;

  static Serializer<PrivacyRequestAcceptedStateEnum> get serializer => _$privacyRequestAcceptedStateEnumSerializer;

  const PrivacyRequestAcceptedStateEnum._(String name): super(name);

  static BuiltSet<PrivacyRequestAcceptedStateEnum> get values => _$privacyRequestAcceptedStateEnumValues;
  static PrivacyRequestAcceptedStateEnum valueOf(String name) => _$privacyRequestAcceptedStateEnumValueOf(name);
}
