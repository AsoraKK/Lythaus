//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:built_collection/built_collection.dart';
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'owner_suggestion_request.g.dart';

/// OwnerSuggestionRequest
///
/// Properties:
/// * [kind]
/// * [category]
/// * [title]
/// * [improvement]
/// * [benefit]
/// * [id]
/// * [revision]
/// * [state]
/// * [createdAt]
/// * [updatedAt]
/// * [memberMessage]
/// * [closed] - Whether new replies are closed for this request.
/// * [submitterId]
@BuiltValue()
abstract class OwnerSuggestionRequest implements Built<OwnerSuggestionRequest, OwnerSuggestionRequestBuilder> {
  @BuiltValueField(wireName: r'kind')
  OwnerSuggestionRequestKindEnum get kind;
  // enum kindEnum {  suggestion,  };

  @BuiltValueField(wireName: r'category')
  String get category;

  @BuiltValueField(wireName: r'title')
  String get title;

  @BuiltValueField(wireName: r'improvement')
  String get improvement;

  @BuiltValueField(wireName: r'benefit')
  String get benefit;

  @BuiltValueField(wireName: r'id')
  String get id;

  @BuiltValueField(wireName: r'revision')
  int get revision;

  @BuiltValueField(wireName: r'state')
  String get state;

  @BuiltValueField(wireName: r'createdAt')
  DateTime get createdAt;

  @BuiltValueField(wireName: r'updatedAt')
  DateTime get updatedAt;

  @BuiltValueField(wireName: r'memberMessage')
  String? get memberMessage;

  /// Whether new replies are closed for this request.
  @BuiltValueField(wireName: r'closed')
  bool? get closed;

  @BuiltValueField(wireName: r'submitterId')
  String get submitterId;

  OwnerSuggestionRequest._();

  factory OwnerSuggestionRequest([void updates(OwnerSuggestionRequestBuilder b)]) = _$OwnerSuggestionRequest;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(OwnerSuggestionRequestBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<OwnerSuggestionRequest> get serializer => _$OwnerSuggestionRequestSerializer();
}

class _$OwnerSuggestionRequestSerializer implements PrimitiveSerializer<OwnerSuggestionRequest> {
  @override
  final Iterable<Type> types = const [OwnerSuggestionRequest, _$OwnerSuggestionRequest];

  @override
  final String wireName = r'OwnerSuggestionRequest';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    OwnerSuggestionRequest object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    yield r'kind';
    yield serializers.serialize(
      object.kind,
      specifiedType: const FullType(OwnerSuggestionRequestKindEnum),
    );
    yield r'category';
    yield serializers.serialize(
      object.category,
      specifiedType: const FullType(String),
    );
    yield r'title';
    yield serializers.serialize(
      object.title,
      specifiedType: const FullType(String),
    );
    yield r'improvement';
    yield serializers.serialize(
      object.improvement,
      specifiedType: const FullType(String),
    );
    yield r'benefit';
    yield serializers.serialize(
      object.benefit,
      specifiedType: const FullType(String),
    );
    yield r'id';
    yield serializers.serialize(
      object.id,
      specifiedType: const FullType(String),
    );
    yield r'revision';
    yield serializers.serialize(
      object.revision,
      specifiedType: const FullType(int),
    );
    yield r'state';
    yield serializers.serialize(
      object.state,
      specifiedType: const FullType(String),
    );
    yield r'createdAt';
    yield serializers.serialize(
      object.createdAt,
      specifiedType: const FullType(DateTime),
    );
    yield r'updatedAt';
    yield serializers.serialize(
      object.updatedAt,
      specifiedType: const FullType(DateTime),
    );
    yield r'memberMessage';
    yield object.memberMessage == null ? null : serializers.serialize(
      object.memberMessage,
      specifiedType: const FullType.nullable(String),
    );
    if (object.closed != null) {
      yield r'closed';
      yield serializers.serialize(
        object.closed,
        specifiedType: const FullType(bool),
      );
    }
    yield r'submitterId';
    yield serializers.serialize(
      object.submitterId,
      specifiedType: const FullType(String),
    );
  }

  @override
  Object serialize(
    Serializers serializers,
    OwnerSuggestionRequest object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required OwnerSuggestionRequestBuilder result,
    required List<Object?> unhandled,
  }) {
    for (var i = 0; i < serializedList.length; i += 2) {
      final key = serializedList[i] as String;
      final value = serializedList[i + 1];
      switch (key) {
        case r'kind':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(OwnerSuggestionRequestKindEnum),
          ) as OwnerSuggestionRequestKindEnum;
          result.kind = valueDes;
          break;
        case r'category':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.category = valueDes;
          break;
        case r'title':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.title = valueDes;
          break;
        case r'improvement':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.improvement = valueDes;
          break;
        case r'benefit':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.benefit = valueDes;
          break;
        case r'id':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.id = valueDes;
          break;
        case r'revision':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(int),
          ) as int;
          result.revision = valueDes;
          break;
        case r'state':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.state = valueDes;
          break;
        case r'createdAt':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(DateTime),
          ) as DateTime;
          result.createdAt = valueDes;
          break;
        case r'updatedAt':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(DateTime),
          ) as DateTime;
          result.updatedAt = valueDes;
          break;
        case r'memberMessage':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType.nullable(String),
          ) as String?;
          if (valueDes == null) continue;
          result.memberMessage = valueDes;
          break;
        case r'closed':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(bool),
          ) as bool;
          result.closed = valueDes;
          break;
        case r'submitterId':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.submitterId = valueDes;
          break;
        default:
          unhandled.add(key);
          unhandled.add(value);
          break;
      }
    }
  }

  @override
  OwnerSuggestionRequest deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = OwnerSuggestionRequestBuilder();
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

class OwnerSuggestionRequestKindEnum extends EnumClass {

  @BuiltValueEnumConst(wireName: r'suggestion')
  static const OwnerSuggestionRequestKindEnum suggestion = _$ownerSuggestionRequestKindEnum_suggestion;

  static Serializer<OwnerSuggestionRequestKindEnum> get serializer => _$ownerSuggestionRequestKindEnumSerializer;

  const OwnerSuggestionRequestKindEnum._(String name): super(name);

  static BuiltSet<OwnerSuggestionRequestKindEnum> get values => _$ownerSuggestionRequestKindEnumValues;
  static OwnerSuggestionRequestKindEnum valueOf(String name) => _$ownerSuggestionRequestKindEnumValueOf(name);
}
