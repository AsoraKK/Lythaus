//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:built_collection/built_collection.dart';
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'reaction_request.g.dart';

/// ReactionRequest
///
/// Properties:
/// * [reactionType]
@BuiltValue()
abstract class ReactionRequest implements Built<ReactionRequest, ReactionRequestBuilder> {
  @BuiltValueField(wireName: r'reactionType')
  ReactionRequestReactionTypeEnum get reactionType;
  // enum reactionTypeEnum {  like,  insightful,  support,  };

  ReactionRequest._();

  factory ReactionRequest([void updates(ReactionRequestBuilder b)]) = _$ReactionRequest;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(ReactionRequestBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<ReactionRequest> get serializer => _$ReactionRequestSerializer();
}

class _$ReactionRequestSerializer implements PrimitiveSerializer<ReactionRequest> {
  @override
  final Iterable<Type> types = const [ReactionRequest, _$ReactionRequest];

  @override
  final String wireName = r'ReactionRequest';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    ReactionRequest object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    yield r'reactionType';
    yield serializers.serialize(
      object.reactionType,
      specifiedType: const FullType(ReactionRequestReactionTypeEnum),
    );
  }

  @override
  Object serialize(
    Serializers serializers,
    ReactionRequest object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required ReactionRequestBuilder result,
    required List<Object?> unhandled,
  }) {
    for (var i = 0; i < serializedList.length; i += 2) {
      final key = serializedList[i] as String;
      final value = serializedList[i + 1];
      switch (key) {
        case r'reactionType':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(ReactionRequestReactionTypeEnum),
          ) as ReactionRequestReactionTypeEnum;
          result.reactionType = valueDes;
          break;
        default:
          unhandled.add(key);
          unhandled.add(value);
          break;
      }
    }
  }

  @override
  ReactionRequest deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = ReactionRequestBuilder();
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

class ReactionRequestReactionTypeEnum extends EnumClass {

  @BuiltValueEnumConst(wireName: r'like')
  static const ReactionRequestReactionTypeEnum like = _$reactionRequestReactionTypeEnum_like;
  @BuiltValueEnumConst(wireName: r'insightful')
  static const ReactionRequestReactionTypeEnum insightful = _$reactionRequestReactionTypeEnum_insightful;
  @BuiltValueEnumConst(wireName: r'support')
  static const ReactionRequestReactionTypeEnum support = _$reactionRequestReactionTypeEnum_support;

  static Serializer<ReactionRequestReactionTypeEnum> get serializer => _$reactionRequestReactionTypeEnumSerializer;

  const ReactionRequestReactionTypeEnum._(String name): super(name);

  static BuiltSet<ReactionRequestReactionTypeEnum> get values => _$reactionRequestReactionTypeEnumValues;
  static ReactionRequestReactionTypeEnum valueOf(String name) => _$reactionRequestReactionTypeEnumValueOf(name);
}
