//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:lythaus_api_client/src/model/reviewer_qualification_state.dart';
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'reviewer_qualification_response.g.dart';

/// ReviewerQualificationResponse
///
/// Properties:
/// * [reviewerId]
/// * [state]
/// * [policyVersion]
@BuiltValue()
abstract class ReviewerQualificationResponse implements Built<ReviewerQualificationResponse, ReviewerQualificationResponseBuilder> {
  @BuiltValueField(wireName: r'reviewerId')
  String get reviewerId;

  @BuiltValueField(wireName: r'state')
  ReviewerQualificationState get state;
  // enum stateEnum {  none,  eligible,  trained,  suspended,  };

  @BuiltValueField(wireName: r'policyVersion')
  String get policyVersion;

  ReviewerQualificationResponse._();

  factory ReviewerQualificationResponse([void updates(ReviewerQualificationResponseBuilder b)]) = _$ReviewerQualificationResponse;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(ReviewerQualificationResponseBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<ReviewerQualificationResponse> get serializer => _$ReviewerQualificationResponseSerializer();
}

class _$ReviewerQualificationResponseSerializer implements PrimitiveSerializer<ReviewerQualificationResponse> {
  @override
  final Iterable<Type> types = const [ReviewerQualificationResponse, _$ReviewerQualificationResponse];

  @override
  final String wireName = r'ReviewerQualificationResponse';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    ReviewerQualificationResponse object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    yield r'reviewerId';
    yield serializers.serialize(
      object.reviewerId,
      specifiedType: const FullType(String),
    );
    yield r'state';
    yield serializers.serialize(
      object.state,
      specifiedType: const FullType(ReviewerQualificationState),
    );
    yield r'policyVersion';
    yield serializers.serialize(
      object.policyVersion,
      specifiedType: const FullType(String),
    );
  }

  @override
  Object serialize(
    Serializers serializers,
    ReviewerQualificationResponse object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required ReviewerQualificationResponseBuilder result,
    required List<Object?> unhandled,
  }) {
    for (var i = 0; i < serializedList.length; i += 2) {
      final key = serializedList[i] as String;
      final value = serializedList[i + 1];
      switch (key) {
        case r'reviewerId':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.reviewerId = valueDes;
          break;
        case r'state':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(ReviewerQualificationState),
          ) as ReviewerQualificationState;
          result.state = valueDes;
          break;
        case r'policyVersion':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.policyVersion = valueDes;
          break;
        default:
          unhandled.add(key);
          unhandled.add(value);
          break;
      }
    }
  }

  @override
  ReviewerQualificationResponse deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = ReviewerQualificationResponseBuilder();
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
