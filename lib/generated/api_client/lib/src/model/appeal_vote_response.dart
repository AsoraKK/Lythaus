//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:lythaus_api_client/src/model/appeal_vote_response_vote.dart';
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'appeal_vote_response.g.dart';

/// Confirmation of a recorded appeal vote.
///
/// Properties:
/// * [vote]
@BuiltValue()
abstract class AppealVoteResponse implements Built<AppealVoteResponse, AppealVoteResponseBuilder> {
  @BuiltValueField(wireName: r'vote')
  AppealVoteResponseVote get vote;

  AppealVoteResponse._();

  factory AppealVoteResponse([void updates(AppealVoteResponseBuilder b)]) = _$AppealVoteResponse;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(AppealVoteResponseBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<AppealVoteResponse> get serializer => _$AppealVoteResponseSerializer();
}

class _$AppealVoteResponseSerializer implements PrimitiveSerializer<AppealVoteResponse> {
  @override
  final Iterable<Type> types = const [AppealVoteResponse, _$AppealVoteResponse];

  @override
  final String wireName = r'AppealVoteResponse';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    AppealVoteResponse object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    yield r'vote';
    yield serializers.serialize(
      object.vote,
      specifiedType: const FullType(AppealVoteResponseVote),
    );
  }

  @override
  Object serialize(
    Serializers serializers,
    AppealVoteResponse object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required AppealVoteResponseBuilder result,
    required List<Object?> unhandled,
  }) {
    for (var i = 0; i < serializedList.length; i += 2) {
      final key = serializedList[i] as String;
      final value = serializedList[i + 1];
      switch (key) {
        case r'vote':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(AppealVoteResponseVote),
          ) as AppealVoteResponseVote;
          result.vote.replace(valueDes);
          break;
        default:
          unhandled.add(key);
          unhandled.add(value);
          break;
      }
    }
  }

  @override
  AppealVoteResponse deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = AppealVoteResponseBuilder();
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
