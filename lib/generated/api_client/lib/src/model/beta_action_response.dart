//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'beta_action_response.g.dart';

/// BetaActionResponse
///
/// Properties:
/// * [caseId]
/// * [status]
/// * [accepted]
/// * [publicationEligible]
@BuiltValue()
abstract class BetaActionResponse implements Built<BetaActionResponse, BetaActionResponseBuilder> {
  @BuiltValueField(wireName: r'caseId')
  String? get caseId;

  @BuiltValueField(wireName: r'status')
  String? get status;

  @BuiltValueField(wireName: r'accepted')
  bool? get accepted;

  @BuiltValueField(wireName: r'publicationEligible')
  bool? get publicationEligible;

  BetaActionResponse._();

  factory BetaActionResponse([void updates(BetaActionResponseBuilder b)]) = _$BetaActionResponse;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(BetaActionResponseBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<BetaActionResponse> get serializer => _$BetaActionResponseSerializer();
}

class _$BetaActionResponseSerializer implements PrimitiveSerializer<BetaActionResponse> {
  @override
  final Iterable<Type> types = const [BetaActionResponse, _$BetaActionResponse];

  @override
  final String wireName = r'BetaActionResponse';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    BetaActionResponse object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    if (object.caseId != null) {
      yield r'caseId';
      yield serializers.serialize(
        object.caseId,
        specifiedType: const FullType(String),
      );
    }
    if (object.status != null) {
      yield r'status';
      yield serializers.serialize(
        object.status,
        specifiedType: const FullType(String),
      );
    }
    if (object.accepted != null) {
      yield r'accepted';
      yield serializers.serialize(
        object.accepted,
        specifiedType: const FullType(bool),
      );
    }
    if (object.publicationEligible != null) {
      yield r'publicationEligible';
      yield serializers.serialize(
        object.publicationEligible,
        specifiedType: const FullType(bool),
      );
    }
  }

  @override
  Object serialize(
    Serializers serializers,
    BetaActionResponse object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required BetaActionResponseBuilder result,
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
        case r'status':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.status = valueDes;
          break;
        case r'accepted':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(bool),
          ) as bool;
          result.accepted = valueDes;
          break;
        case r'publicationEligible':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(bool),
          ) as bool;
          result.publicationEligible = valueDes;
          break;
        default:
          unhandled.add(key);
          unhandled.add(value);
          break;
      }
    }
  }

  @override
  BetaActionResponse deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = BetaActionResponseBuilder();
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
