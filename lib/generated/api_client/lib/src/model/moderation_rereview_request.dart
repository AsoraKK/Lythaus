//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:lythaus_api_client/src/model/moderation_case_revision.dart';
import 'package:built_collection/built_collection.dart';
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'moderation_rereview_request.g.dart';

/// ModerationRereviewRequest
///
/// Properties:
/// * [expectedCaseState]
/// * [expectedRevision]
/// * [reasonCode]
@BuiltValue()
abstract class ModerationRereviewRequest implements Built<ModerationRereviewRequest, ModerationRereviewRequestBuilder> {
  @BuiltValueField(wireName: r'expectedCaseState')
  ModerationRereviewRequestExpectedCaseStateEnum get expectedCaseState;
  // enum expectedCaseStateEnum {  resolved,  };

  @BuiltValueField(wireName: r'expectedRevision')
  ModerationCaseRevision get expectedRevision;

  @BuiltValueField(wireName: r'reasonCode')
  String get reasonCode;

  ModerationRereviewRequest._();

  factory ModerationRereviewRequest([void updates(ModerationRereviewRequestBuilder b)]) = _$ModerationRereviewRequest;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(ModerationRereviewRequestBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<ModerationRereviewRequest> get serializer => _$ModerationRereviewRequestSerializer();
}

class _$ModerationRereviewRequestSerializer implements PrimitiveSerializer<ModerationRereviewRequest> {
  @override
  final Iterable<Type> types = const [ModerationRereviewRequest, _$ModerationRereviewRequest];

  @override
  final String wireName = r'ModerationRereviewRequest';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    ModerationRereviewRequest object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    yield r'expectedCaseState';
    yield serializers.serialize(
      object.expectedCaseState,
      specifiedType: const FullType(ModerationRereviewRequestExpectedCaseStateEnum),
    );
    yield r'expectedRevision';
    yield serializers.serialize(
      object.expectedRevision,
      specifiedType: const FullType(ModerationCaseRevision),
    );
    yield r'reasonCode';
    yield serializers.serialize(
      object.reasonCode,
      specifiedType: const FullType(String),
    );
  }

  @override
  Object serialize(
    Serializers serializers,
    ModerationRereviewRequest object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required ModerationRereviewRequestBuilder result,
    required List<Object?> unhandled,
  }) {
    for (var i = 0; i < serializedList.length; i += 2) {
      final key = serializedList[i] as String;
      final value = serializedList[i + 1];
      switch (key) {
        case r'expectedCaseState':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(ModerationRereviewRequestExpectedCaseStateEnum),
          ) as ModerationRereviewRequestExpectedCaseStateEnum;
          result.expectedCaseState = valueDes;
          break;
        case r'expectedRevision':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(ModerationCaseRevision),
          ) as ModerationCaseRevision;
          result.expectedRevision.replace(valueDes);
          break;
        case r'reasonCode':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.reasonCode = valueDes;
          break;
        default:
          unhandled.add(key);
          unhandled.add(value);
          break;
      }
    }
  }

  @override
  ModerationRereviewRequest deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = ModerationRereviewRequestBuilder();
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

class ModerationRereviewRequestExpectedCaseStateEnum extends EnumClass {

  @BuiltValueEnumConst(wireName: r'resolved')
  static const ModerationRereviewRequestExpectedCaseStateEnum resolved = _$moderationRereviewRequestExpectedCaseStateEnum_resolved;

  static Serializer<ModerationRereviewRequestExpectedCaseStateEnum> get serializer => _$moderationRereviewRequestExpectedCaseStateEnumSerializer;

  const ModerationRereviewRequestExpectedCaseStateEnum._(String name): super(name);

  static BuiltSet<ModerationRereviewRequestExpectedCaseStateEnum> get values => _$moderationRereviewRequestExpectedCaseStateEnumValues;
  static ModerationRereviewRequestExpectedCaseStateEnum valueOf(String name) => _$moderationRereviewRequestExpectedCaseStateEnumValueOf(name);
}
