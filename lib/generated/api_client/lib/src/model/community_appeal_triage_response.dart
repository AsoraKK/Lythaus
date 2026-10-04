//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:built_collection/built_collection.dart';
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'community_appeal_triage_response.g.dart';

/// CommunityAppealTriageResponse
///
/// Properties:
/// * [appealId]
/// * [state]
/// * [opensAt]
/// * [closesAt]
@BuiltValue()
abstract class CommunityAppealTriageResponse implements Built<CommunityAppealTriageResponse, CommunityAppealTriageResponseBuilder> {
  @BuiltValueField(wireName: r'appealId')
  String get appealId;

  @BuiltValueField(wireName: r'state')
  CommunityAppealTriageResponseStateEnum get state;
  // enum stateEnum {  open,  restricted_review,  };

  @BuiltValueField(wireName: r'opensAt')
  DateTime? get opensAt;

  @BuiltValueField(wireName: r'closesAt')
  DateTime? get closesAt;

  CommunityAppealTriageResponse._();

  factory CommunityAppealTriageResponse([void updates(CommunityAppealTriageResponseBuilder b)]) = _$CommunityAppealTriageResponse;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(CommunityAppealTriageResponseBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<CommunityAppealTriageResponse> get serializer => _$CommunityAppealTriageResponseSerializer();
}

class _$CommunityAppealTriageResponseSerializer implements PrimitiveSerializer<CommunityAppealTriageResponse> {
  @override
  final Iterable<Type> types = const [CommunityAppealTriageResponse, _$CommunityAppealTriageResponse];

  @override
  final String wireName = r'CommunityAppealTriageResponse';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    CommunityAppealTriageResponse object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    yield r'appealId';
    yield serializers.serialize(
      object.appealId,
      specifiedType: const FullType(String),
    );
    yield r'state';
    yield serializers.serialize(
      object.state,
      specifiedType: const FullType(CommunityAppealTriageResponseStateEnum),
    );
    yield r'opensAt';
    yield object.opensAt == null ? null : serializers.serialize(
      object.opensAt,
      specifiedType: const FullType.nullable(DateTime),
    );
    yield r'closesAt';
    yield object.closesAt == null ? null : serializers.serialize(
      object.closesAt,
      specifiedType: const FullType.nullable(DateTime),
    );
  }

  @override
  Object serialize(
    Serializers serializers,
    CommunityAppealTriageResponse object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required CommunityAppealTriageResponseBuilder result,
    required List<Object?> unhandled,
  }) {
    for (var i = 0; i < serializedList.length; i += 2) {
      final key = serializedList[i] as String;
      final value = serializedList[i + 1];
      switch (key) {
        case r'appealId':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.appealId = valueDes;
          break;
        case r'state':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(CommunityAppealTriageResponseStateEnum),
          ) as CommunityAppealTriageResponseStateEnum;
          result.state = valueDes;
          break;
        case r'opensAt':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType.nullable(DateTime),
          ) as DateTime?;
          if (valueDes == null) continue;
          result.opensAt = valueDes;
          break;
        case r'closesAt':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType.nullable(DateTime),
          ) as DateTime?;
          if (valueDes == null) continue;
          result.closesAt = valueDes;
          break;
        default:
          unhandled.add(key);
          unhandled.add(value);
          break;
      }
    }
  }

  @override
  CommunityAppealTriageResponse deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = CommunityAppealTriageResponseBuilder();
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

class CommunityAppealTriageResponseStateEnum extends EnumClass {

  @BuiltValueEnumConst(wireName: r'open')
  static const CommunityAppealTriageResponseStateEnum open = _$communityAppealTriageResponseStateEnum_open;
  @BuiltValueEnumConst(wireName: r'restricted_review')
  static const CommunityAppealTriageResponseStateEnum restrictedReview = _$communityAppealTriageResponseStateEnum_restrictedReview;

  static Serializer<CommunityAppealTriageResponseStateEnum> get serializer => _$communityAppealTriageResponseStateEnumSerializer;

  const CommunityAppealTriageResponseStateEnum._(String name): super(name);

  static BuiltSet<CommunityAppealTriageResponseStateEnum> get values => _$communityAppealTriageResponseStateEnumValues;
  static CommunityAppealTriageResponseStateEnum valueOf(String name) => _$communityAppealTriageResponseStateEnumValueOf(name);
}
