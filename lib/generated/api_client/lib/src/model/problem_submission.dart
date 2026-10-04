//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:built_collection/built_collection.dart';
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'problem_submission.g.dart';

/// ProblemSubmission
///
/// Properties:
/// * [kind]
/// * [category]
/// * [title]
/// * [actual]
/// * [expected]
/// * [reproductionSteps]
/// * [appVersion]
/// * [platform]
@BuiltValue()
abstract class ProblemSubmission implements Built<ProblemSubmission, ProblemSubmissionBuilder> {
  @BuiltValueField(wireName: r'kind')
  ProblemSubmissionKindEnum get kind;
  // enum kindEnum {  problem,  };

  @BuiltValueField(wireName: r'category')
  String get category;

  @BuiltValueField(wireName: r'title')
  String get title;

  @BuiltValueField(wireName: r'actual')
  String get actual;

  @BuiltValueField(wireName: r'expected')
  String get expected;

  @BuiltValueField(wireName: r'reproductionSteps')
  String? get reproductionSteps;

  @BuiltValueField(wireName: r'appVersion')
  String? get appVersion;

  @BuiltValueField(wireName: r'platform')
  String? get platform;

  ProblemSubmission._();

  factory ProblemSubmission([void updates(ProblemSubmissionBuilder b)]) = _$ProblemSubmission;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(ProblemSubmissionBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<ProblemSubmission> get serializer => _$ProblemSubmissionSerializer();
}

class _$ProblemSubmissionSerializer implements PrimitiveSerializer<ProblemSubmission> {
  @override
  final Iterable<Type> types = const [ProblemSubmission, _$ProblemSubmission];

  @override
  final String wireName = r'ProblemSubmission';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    ProblemSubmission object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    yield r'kind';
    yield serializers.serialize(
      object.kind,
      specifiedType: const FullType(ProblemSubmissionKindEnum),
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
    yield r'actual';
    yield serializers.serialize(
      object.actual,
      specifiedType: const FullType(String),
    );
    yield r'expected';
    yield serializers.serialize(
      object.expected,
      specifiedType: const FullType(String),
    );
    if (object.reproductionSteps != null) {
      yield r'reproductionSteps';
      yield serializers.serialize(
        object.reproductionSteps,
        specifiedType: const FullType(String),
      );
    }
    if (object.appVersion != null) {
      yield r'appVersion';
      yield serializers.serialize(
        object.appVersion,
        specifiedType: const FullType(String),
      );
    }
    if (object.platform != null) {
      yield r'platform';
      yield serializers.serialize(
        object.platform,
        specifiedType: const FullType(String),
      );
    }
  }

  @override
  Object serialize(
    Serializers serializers,
    ProblemSubmission object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required ProblemSubmissionBuilder result,
    required List<Object?> unhandled,
  }) {
    for (var i = 0; i < serializedList.length; i += 2) {
      final key = serializedList[i] as String;
      final value = serializedList[i + 1];
      switch (key) {
        case r'kind':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(ProblemSubmissionKindEnum),
          ) as ProblemSubmissionKindEnum;
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
        case r'actual':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.actual = valueDes;
          break;
        case r'expected':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.expected = valueDes;
          break;
        case r'reproductionSteps':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.reproductionSteps = valueDes;
          break;
        case r'appVersion':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.appVersion = valueDes;
          break;
        case r'platform':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.platform = valueDes;
          break;
        default:
          unhandled.add(key);
          unhandled.add(value);
          break;
      }
    }
  }

  @override
  ProblemSubmission deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = ProblemSubmissionBuilder();
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

class ProblemSubmissionKindEnum extends EnumClass {

  @BuiltValueEnumConst(wireName: r'problem')
  static const ProblemSubmissionKindEnum problem = _$problemSubmissionKindEnum_problem;

  static Serializer<ProblemSubmissionKindEnum> get serializer => _$problemSubmissionKindEnumSerializer;

  const ProblemSubmissionKindEnum._(String name): super(name);

  static BuiltSet<ProblemSubmissionKindEnum> get values => _$problemSubmissionKindEnumValues;
  static ProblemSubmissionKindEnum valueOf(String name) => _$problemSubmissionKindEnumValueOf(name);
}
