//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:lythaus_api_client/src/model/admin_content_state.dart';
import 'package:lythaus_api_client/src/model/admin_appeal_status.dart';
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'admin_appeal_decision_response.g.dart';

/// AdminAppealDecisionResponse
///
/// Properties:
/// * [appealId]
/// * [status]
/// * [contentId]
/// * [contentStatus]
@BuiltValue()
abstract class AdminAppealDecisionResponse implements Built<AdminAppealDecisionResponse, AdminAppealDecisionResponseBuilder> {
  @BuiltValueField(wireName: r'appealId')
  String? get appealId;

  @BuiltValueField(wireName: r'status')
  AdminAppealStatus? get status;
  // enum statusEnum {  PENDING,  APPROVED,  REJECTED,  OVERRIDDEN,  };

  @BuiltValueField(wireName: r'contentId')
  String? get contentId;

  @BuiltValueField(wireName: r'contentStatus')
  AdminContentState? get contentStatus;
  // enum contentStatusEnum {  PUBLISHED,  BLOCKED,  };

  AdminAppealDecisionResponse._();

  factory AdminAppealDecisionResponse([void updates(AdminAppealDecisionResponseBuilder b)]) = _$AdminAppealDecisionResponse;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(AdminAppealDecisionResponseBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<AdminAppealDecisionResponse> get serializer => _$AdminAppealDecisionResponseSerializer();
}

class _$AdminAppealDecisionResponseSerializer implements PrimitiveSerializer<AdminAppealDecisionResponse> {
  @override
  final Iterable<Type> types = const [AdminAppealDecisionResponse, _$AdminAppealDecisionResponse];

  @override
  final String wireName = r'AdminAppealDecisionResponse';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    AdminAppealDecisionResponse object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    if (object.appealId != null) {
      yield r'appealId';
      yield serializers.serialize(
        object.appealId,
        specifiedType: const FullType(String),
      );
    }
    if (object.status != null) {
      yield r'status';
      yield serializers.serialize(
        object.status,
        specifiedType: const FullType(AdminAppealStatus),
      );
    }
    if (object.contentId != null) {
      yield r'contentId';
      yield serializers.serialize(
        object.contentId,
        specifiedType: const FullType(String),
      );
    }
    if (object.contentStatus != null) {
      yield r'contentStatus';
      yield serializers.serialize(
        object.contentStatus,
        specifiedType: const FullType(AdminContentState),
      );
    }
  }

  @override
  Object serialize(
    Serializers serializers,
    AdminAppealDecisionResponse object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required AdminAppealDecisionResponseBuilder result,
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
        case r'status':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(AdminAppealStatus),
          ) as AdminAppealStatus;
          result.status = valueDes;
          break;
        case r'contentId':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.contentId = valueDes;
          break;
        case r'contentStatus':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(AdminContentState),
          ) as AdminContentState;
          result.contentStatus = valueDes;
          break;
        default:
          unhandled.add(key);
          unhandled.add(value);
          break;
      }
    }
  }

  @override
  AdminAppealDecisionResponse deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = AdminAppealDecisionResponseBuilder();
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
