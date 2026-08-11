//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:lythaus_api_client/src/model/reviewer_qualification_state.dart';
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'reviewer_qualification_update_request.g.dart';

/// ReviewerQualificationUpdateRequest
///
/// Properties:
/// * [state]
/// * [reasonCode]
@BuiltValue()
abstract class ReviewerQualificationUpdateRequest implements Built<ReviewerQualificationUpdateRequest, ReviewerQualificationUpdateRequestBuilder> {
  @BuiltValueField(wireName: r'state')
  ReviewerQualificationState get state;
  // enum stateEnum {  none,  eligible,  trained,  suspended,  };

  @BuiltValueField(wireName: r'reasonCode')
  String get reasonCode;

  ReviewerQualificationUpdateRequest._();

  factory ReviewerQualificationUpdateRequest([void updates(ReviewerQualificationUpdateRequestBuilder b)]) = _$ReviewerQualificationUpdateRequest;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(ReviewerQualificationUpdateRequestBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<ReviewerQualificationUpdateRequest> get serializer => _$ReviewerQualificationUpdateRequestSerializer();
}

class _$ReviewerQualificationUpdateRequestSerializer implements PrimitiveSerializer<ReviewerQualificationUpdateRequest> {
  @override
  final Iterable<Type> types = const [ReviewerQualificationUpdateRequest, _$ReviewerQualificationUpdateRequest];

  @override
  final String wireName = r'ReviewerQualificationUpdateRequest';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    ReviewerQualificationUpdateRequest object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    yield r'state';
    yield serializers.serialize(
      object.state,
      specifiedType: const FullType(ReviewerQualificationState),
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
    ReviewerQualificationUpdateRequest object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required ReviewerQualificationUpdateRequestBuilder result,
    required List<Object?> unhandled,
  }) {
    for (var i = 0; i < serializedList.length; i += 2) {
      final key = serializedList[i] as String;
      final value = serializedList[i + 1];
      switch (key) {
        case r'state':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(ReviewerQualificationState),
          ) as ReviewerQualificationState;
          result.state = valueDes;
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
  ReviewerQualificationUpdateRequest deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = ReviewerQualificationUpdateRequestBuilder();
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
