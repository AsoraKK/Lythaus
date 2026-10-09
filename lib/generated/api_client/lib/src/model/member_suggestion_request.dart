//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:built_collection/built_collection.dart';
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'member_suggestion_request.g.dart';

/// MemberSuggestionRequest
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
@BuiltValue()
abstract class MemberSuggestionRequest implements Built<MemberSuggestionRequest, MemberSuggestionRequestBuilder> {
  @BuiltValueField(wireName: r'kind')
  MemberSuggestionRequestKindEnum get kind;
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

  MemberSuggestionRequest._();

  factory MemberSuggestionRequest([void updates(MemberSuggestionRequestBuilder b)]) = _$MemberSuggestionRequest;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(MemberSuggestionRequestBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<MemberSuggestionRequest> get serializer => _$MemberSuggestionRequestSerializer();
}

class _$MemberSuggestionRequestSerializer implements PrimitiveSerializer<MemberSuggestionRequest> {
  @override
  final Iterable<Type> types = const [MemberSuggestionRequest, _$MemberSuggestionRequest];

  @override
  final String wireName = r'MemberSuggestionRequest';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    MemberSuggestionRequest object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    yield r'kind';
    yield serializers.serialize(
      object.kind,
      specifiedType: const FullType(MemberSuggestionRequestKindEnum),
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
  }

  @override
  Object serialize(
    Serializers serializers,
    MemberSuggestionRequest object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required MemberSuggestionRequestBuilder result,
    required List<Object?> unhandled,
  }) {
    for (var i = 0; i < serializedList.length; i += 2) {
      final key = serializedList[i] as String;
      final value = serializedList[i + 1];
      switch (key) {
        case r'kind':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(MemberSuggestionRequestKindEnum),
          ) as MemberSuggestionRequestKindEnum;
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
        default:
          unhandled.add(key);
          unhandled.add(value);
          break;
      }
    }
  }

  @override
  MemberSuggestionRequest deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = MemberSuggestionRequestBuilder();
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

class MemberSuggestionRequestKindEnum extends EnumClass {

  @BuiltValueEnumConst(wireName: r'suggestion')
  static const MemberSuggestionRequestKindEnum suggestion = _$memberSuggestionRequestKindEnum_suggestion;

  static Serializer<MemberSuggestionRequestKindEnum> get serializer => _$memberSuggestionRequestKindEnumSerializer;

  const MemberSuggestionRequestKindEnum._(String name): super(name);

  static BuiltSet<MemberSuggestionRequestKindEnum> get values => _$memberSuggestionRequestKindEnumValues;
  static MemberSuggestionRequestKindEnum valueOf(String name) => _$memberSuggestionRequestKindEnumValueOf(name);
}
