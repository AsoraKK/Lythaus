//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:built_collection/built_collection.dart';
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'suggestion_submission.g.dart';

/// SuggestionSubmission
///
/// Properties:
/// * [kind]
/// * [category]
/// * [title]
/// * [improvement]
/// * [benefit]
@BuiltValue()
abstract class SuggestionSubmission implements Built<SuggestionSubmission, SuggestionSubmissionBuilder> {
  @BuiltValueField(wireName: r'kind')
  SuggestionSubmissionKindEnum get kind;
  // enum kindEnum {  suggestion,  };

  @BuiltValueField(wireName: r'category')
  String get category;

  @BuiltValueField(wireName: r'title')
  String get title;

  @BuiltValueField(wireName: r'improvement')
  String get improvement;

  @BuiltValueField(wireName: r'benefit')
  String get benefit;

  SuggestionSubmission._();

  factory SuggestionSubmission([void updates(SuggestionSubmissionBuilder b)]) = _$SuggestionSubmission;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(SuggestionSubmissionBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<SuggestionSubmission> get serializer => _$SuggestionSubmissionSerializer();
}

class _$SuggestionSubmissionSerializer implements PrimitiveSerializer<SuggestionSubmission> {
  @override
  final Iterable<Type> types = const [SuggestionSubmission, _$SuggestionSubmission];

  @override
  final String wireName = r'SuggestionSubmission';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    SuggestionSubmission object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    yield r'kind';
    yield serializers.serialize(
      object.kind,
      specifiedType: const FullType(SuggestionSubmissionKindEnum),
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
  }

  @override
  Object serialize(
    Serializers serializers,
    SuggestionSubmission object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required SuggestionSubmissionBuilder result,
    required List<Object?> unhandled,
  }) {
    for (var i = 0; i < serializedList.length; i += 2) {
      final key = serializedList[i] as String;
      final value = serializedList[i + 1];
      switch (key) {
        case r'kind':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(SuggestionSubmissionKindEnum),
          ) as SuggestionSubmissionKindEnum;
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
        default:
          unhandled.add(key);
          unhandled.add(value);
          break;
      }
    }
  }

  @override
  SuggestionSubmission deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = SuggestionSubmissionBuilder();
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

class SuggestionSubmissionKindEnum extends EnumClass {

  @BuiltValueEnumConst(wireName: r'suggestion')
  static const SuggestionSubmissionKindEnum suggestion = _$suggestionSubmissionKindEnum_suggestion;

  static Serializer<SuggestionSubmissionKindEnum> get serializer => _$suggestionSubmissionKindEnumSerializer;

  const SuggestionSubmissionKindEnum._(String name): super(name);

  static BuiltSet<SuggestionSubmissionKindEnum> get values => _$suggestionSubmissionKindEnumValues;
  static SuggestionSubmissionKindEnum valueOf(String name) => _$suggestionSubmissionKindEnumValueOf(name);
}
