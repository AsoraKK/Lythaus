//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:lythaus_api_client/src/model/post_proof_signals.dart';
import 'package:built_collection/built_collection.dart';
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'update_post_request.g.dart';

/// UpdatePostRequest
///
/// Properties:
/// * [content]
/// * [contentType]
/// * [mediaUrls]
/// * [topics]
/// * [visibility]
/// * [isNews]
/// * [aiLabel] - Required whenever content or media changes. Public responses use categorical labels only.
/// * [proofSignals]
@BuiltValue()
abstract class UpdatePostRequest implements Built<UpdatePostRequest, UpdatePostRequestBuilder> {
  @BuiltValueField(wireName: r'content')
  String? get content;

  @BuiltValueField(wireName: r'contentType')
  UpdatePostRequestContentTypeEnum? get contentType;
  // enum contentTypeEnum {  text,  image,  video,  mixed,  };

  @BuiltValueField(wireName: r'mediaUrls')
  BuiltList<String>? get mediaUrls;

  @BuiltValueField(wireName: r'topics')
  BuiltList<String>? get topics;

  @BuiltValueField(wireName: r'visibility')
  UpdatePostRequestVisibilityEnum? get visibility;
  // enum visibilityEnum {  public,  followers,  private,  };

  @BuiltValueField(wireName: r'isNews')
  bool? get isNews;

  /// Required whenever content or media changes. Public responses use categorical labels only.
  @BuiltValueField(wireName: r'aiLabel')
  UpdatePostRequestAiLabelEnum? get aiLabel;
  // enum aiLabelEnum {  human,  assisted,  generated,  };

  @BuiltValueField(wireName: r'proofSignals')
  PostProofSignals? get proofSignals;

  UpdatePostRequest._();

  factory UpdatePostRequest([void updates(UpdatePostRequestBuilder b)]) = _$UpdatePostRequest;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(UpdatePostRequestBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<UpdatePostRequest> get serializer => _$UpdatePostRequestSerializer();
}

class _$UpdatePostRequestSerializer implements PrimitiveSerializer<UpdatePostRequest> {
  @override
  final Iterable<Type> types = const [UpdatePostRequest, _$UpdatePostRequest];

  @override
  final String wireName = r'UpdatePostRequest';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    UpdatePostRequest object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    if (object.content != null) {
      yield r'content';
      yield serializers.serialize(
        object.content,
        specifiedType: const FullType(String),
      );
    }
    if (object.contentType != null) {
      yield r'contentType';
      yield serializers.serialize(
        object.contentType,
        specifiedType: const FullType(UpdatePostRequestContentTypeEnum),
      );
    }
    if (object.mediaUrls != null) {
      yield r'mediaUrls';
      yield serializers.serialize(
        object.mediaUrls,
        specifiedType: const FullType(BuiltList, [FullType(String)]),
      );
    }
    if (object.topics != null) {
      yield r'topics';
      yield serializers.serialize(
        object.topics,
        specifiedType: const FullType(BuiltList, [FullType(String)]),
      );
    }
    if (object.visibility != null) {
      yield r'visibility';
      yield serializers.serialize(
        object.visibility,
        specifiedType: const FullType(UpdatePostRequestVisibilityEnum),
      );
    }
    if (object.isNews != null) {
      yield r'isNews';
      yield serializers.serialize(
        object.isNews,
        specifiedType: const FullType(bool),
      );
    }
    if (object.aiLabel != null) {
      yield r'aiLabel';
      yield serializers.serialize(
        object.aiLabel,
        specifiedType: const FullType(UpdatePostRequestAiLabelEnum),
      );
    }
    if (object.proofSignals != null) {
      yield r'proofSignals';
      yield serializers.serialize(
        object.proofSignals,
        specifiedType: const FullType(PostProofSignals),
      );
    }
  }

  @override
  Object serialize(
    Serializers serializers,
    UpdatePostRequest object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required UpdatePostRequestBuilder result,
    required List<Object?> unhandled,
  }) {
    for (var i = 0; i < serializedList.length; i += 2) {
      final key = serializedList[i] as String;
      final value = serializedList[i + 1];
      switch (key) {
        case r'content':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.content = valueDes;
          break;
        case r'contentType':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(UpdatePostRequestContentTypeEnum),
          ) as UpdatePostRequestContentTypeEnum;
          result.contentType = valueDes;
          break;
        case r'mediaUrls':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(BuiltList, [FullType(String)]),
          ) as BuiltList<String>;
          result.mediaUrls.replace(valueDes);
          break;
        case r'topics':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(BuiltList, [FullType(String)]),
          ) as BuiltList<String>;
          result.topics.replace(valueDes);
          break;
        case r'visibility':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(UpdatePostRequestVisibilityEnum),
          ) as UpdatePostRequestVisibilityEnum;
          result.visibility = valueDes;
          break;
        case r'isNews':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(bool),
          ) as bool;
          result.isNews = valueDes;
          break;
        case r'aiLabel':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(UpdatePostRequestAiLabelEnum),
          ) as UpdatePostRequestAiLabelEnum;
          result.aiLabel = valueDes;
          break;
        case r'proofSignals':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(PostProofSignals),
          ) as PostProofSignals;
          result.proofSignals.replace(valueDes);
          break;
        default:
          unhandled.add(key);
          unhandled.add(value);
          break;
      }
    }
  }

  @override
  UpdatePostRequest deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = UpdatePostRequestBuilder();
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

class UpdatePostRequestContentTypeEnum extends EnumClass {

  @BuiltValueEnumConst(wireName: r'text')
  static const UpdatePostRequestContentTypeEnum text = _$updatePostRequestContentTypeEnum_text;
  @BuiltValueEnumConst(wireName: r'image')
  static const UpdatePostRequestContentTypeEnum image = _$updatePostRequestContentTypeEnum_image;
  @BuiltValueEnumConst(wireName: r'video')
  static const UpdatePostRequestContentTypeEnum video = _$updatePostRequestContentTypeEnum_video;
  @BuiltValueEnumConst(wireName: r'mixed')
  static const UpdatePostRequestContentTypeEnum mixed = _$updatePostRequestContentTypeEnum_mixed;

  static Serializer<UpdatePostRequestContentTypeEnum> get serializer => _$updatePostRequestContentTypeEnumSerializer;

  const UpdatePostRequestContentTypeEnum._(String name): super(name);

  static BuiltSet<UpdatePostRequestContentTypeEnum> get values => _$updatePostRequestContentTypeEnumValues;
  static UpdatePostRequestContentTypeEnum valueOf(String name) => _$updatePostRequestContentTypeEnumValueOf(name);
}

class UpdatePostRequestVisibilityEnum extends EnumClass {

  @BuiltValueEnumConst(wireName: r'public')
  static const UpdatePostRequestVisibilityEnum public = _$updatePostRequestVisibilityEnum_public;
  @BuiltValueEnumConst(wireName: r'followers')
  static const UpdatePostRequestVisibilityEnum followers = _$updatePostRequestVisibilityEnum_followers;
  @BuiltValueEnumConst(wireName: r'private')
  static const UpdatePostRequestVisibilityEnum private = _$updatePostRequestVisibilityEnum_private;

  static Serializer<UpdatePostRequestVisibilityEnum> get serializer => _$updatePostRequestVisibilityEnumSerializer;

  const UpdatePostRequestVisibilityEnum._(String name): super(name);

  static BuiltSet<UpdatePostRequestVisibilityEnum> get values => _$updatePostRequestVisibilityEnumValues;
  static UpdatePostRequestVisibilityEnum valueOf(String name) => _$updatePostRequestVisibilityEnumValueOf(name);
}

class UpdatePostRequestAiLabelEnum extends EnumClass {

  /// Required whenever content or media changes. Public responses use categorical labels only.
  @BuiltValueEnumConst(wireName: r'human')
  static const UpdatePostRequestAiLabelEnum human = _$updatePostRequestAiLabelEnum_human;
  /// Required whenever content or media changes. Public responses use categorical labels only.
  @BuiltValueEnumConst(wireName: r'assisted')
  static const UpdatePostRequestAiLabelEnum assisted = _$updatePostRequestAiLabelEnum_assisted;
  /// Required whenever content or media changes. Public responses use categorical labels only.
  @BuiltValueEnumConst(wireName: r'generated')
  static const UpdatePostRequestAiLabelEnum generated = _$updatePostRequestAiLabelEnum_generated;

  static Serializer<UpdatePostRequestAiLabelEnum> get serializer => _$updatePostRequestAiLabelEnumSerializer;

  const UpdatePostRequestAiLabelEnum._(String name): super(name);

  static BuiltSet<UpdatePostRequestAiLabelEnum> get values => _$updatePostRequestAiLabelEnumValues;
  static UpdatePostRequestAiLabelEnum valueOf(String name) => _$updatePostRequestAiLabelEnumValueOf(name);
}
