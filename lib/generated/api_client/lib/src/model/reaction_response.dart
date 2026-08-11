//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:built_collection/built_collection.dart';
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'reaction_response.g.dart';

/// ReactionResponse
///
/// Properties:
/// * [postId]
/// * [reactionType]
/// * [changed]
@BuiltValue()
abstract class ReactionResponse implements Built<ReactionResponse, ReactionResponseBuilder> {
  @BuiltValueField(wireName: r'postId')
  String get postId;

  @BuiltValueField(wireName: r'reactionType')
  ReactionResponseReactionTypeEnum get reactionType;
  // enum reactionTypeEnum {  like,  insightful,  support,  };

  @BuiltValueField(wireName: r'changed')
  bool get changed;

  ReactionResponse._();

  factory ReactionResponse([void updates(ReactionResponseBuilder b)]) = _$ReactionResponse;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(ReactionResponseBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<ReactionResponse> get serializer => _$ReactionResponseSerializer();
}

class _$ReactionResponseSerializer implements PrimitiveSerializer<ReactionResponse> {
  @override
  final Iterable<Type> types = const [ReactionResponse, _$ReactionResponse];

  @override
  final String wireName = r'ReactionResponse';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    ReactionResponse object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    yield r'postId';
    yield serializers.serialize(
      object.postId,
      specifiedType: const FullType(String),
    );
    yield r'reactionType';
    yield serializers.serialize(
      object.reactionType,
      specifiedType: const FullType(ReactionResponseReactionTypeEnum),
    );
    yield r'changed';
    yield serializers.serialize(
      object.changed,
      specifiedType: const FullType(bool),
    );
  }

  @override
  Object serialize(
    Serializers serializers,
    ReactionResponse object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required ReactionResponseBuilder result,
    required List<Object?> unhandled,
  }) {
    for (var i = 0; i < serializedList.length; i += 2) {
      final key = serializedList[i] as String;
      final value = serializedList[i + 1];
      switch (key) {
        case r'postId':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.postId = valueDes;
          break;
        case r'reactionType':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(ReactionResponseReactionTypeEnum),
          ) as ReactionResponseReactionTypeEnum;
          result.reactionType = valueDes;
          break;
        case r'changed':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(bool),
          ) as bool;
          result.changed = valueDes;
          break;
        default:
          unhandled.add(key);
          unhandled.add(value);
          break;
      }
    }
  }

  @override
  ReactionResponse deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = ReactionResponseBuilder();
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

class ReactionResponseReactionTypeEnum extends EnumClass {

  @BuiltValueEnumConst(wireName: r'like')
  static const ReactionResponseReactionTypeEnum like = _$reactionResponseReactionTypeEnum_like;
  @BuiltValueEnumConst(wireName: r'insightful')
  static const ReactionResponseReactionTypeEnum insightful = _$reactionResponseReactionTypeEnum_insightful;
  @BuiltValueEnumConst(wireName: r'support')
  static const ReactionResponseReactionTypeEnum support = _$reactionResponseReactionTypeEnum_support;

  static Serializer<ReactionResponseReactionTypeEnum> get serializer => _$reactionResponseReactionTypeEnumSerializer;

  const ReactionResponseReactionTypeEnum._(String name): super(name);

  static BuiltSet<ReactionResponseReactionTypeEnum> get values => _$reactionResponseReactionTypeEnumValues;
  static ReactionResponseReactionTypeEnum valueOf(String name) => _$reactionResponseReactionTypeEnumValueOf(name);
}
