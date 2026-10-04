//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:built_collection/built_collection.dart';
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'owner_problem_request.g.dart';

/// OwnerProblemRequest
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
/// * [id]
/// * [revision]
/// * [state]
/// * [createdAt]
/// * [updatedAt]
/// * [memberMessage]
/// * [submitterId]
@BuiltValue()
abstract class OwnerProblemRequest implements Built<OwnerProblemRequest, OwnerProblemRequestBuilder> {
  @BuiltValueField(wireName: r'kind')
  OwnerProblemRequestKindEnum get kind;
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

  @BuiltValueField(wireName: r'submitterId')
  String get submitterId;

  OwnerProblemRequest._();

  factory OwnerProblemRequest([void updates(OwnerProblemRequestBuilder b)]) = _$OwnerProblemRequest;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(OwnerProblemRequestBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<OwnerProblemRequest> get serializer => _$OwnerProblemRequestSerializer();
}

class _$OwnerProblemRequestSerializer implements PrimitiveSerializer<OwnerProblemRequest> {
  @override
  final Iterable<Type> types = const [OwnerProblemRequest, _$OwnerProblemRequest];

  @override
  final String wireName = r'OwnerProblemRequest';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    OwnerProblemRequest object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    yield r'kind';
    yield serializers.serialize(
      object.kind,
      specifiedType: const FullType(OwnerProblemRequestKindEnum),
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
    yield r'submitterId';
    yield serializers.serialize(
      object.submitterId,
      specifiedType: const FullType(String),
    );
  }

  @override
  Object serialize(
    Serializers serializers,
    OwnerProblemRequest object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required OwnerProblemRequestBuilder result,
    required List<Object?> unhandled,
  }) {
    for (var i = 0; i < serializedList.length; i += 2) {
      final key = serializedList[i] as String;
      final value = serializedList[i + 1];
      switch (key) {
        case r'kind':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(OwnerProblemRequestKindEnum),
          ) as OwnerProblemRequestKindEnum;
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
  OwnerProblemRequest deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = OwnerProblemRequestBuilder();
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

class OwnerProblemRequestKindEnum extends EnumClass {

  @BuiltValueEnumConst(wireName: r'problem')
  static const OwnerProblemRequestKindEnum problem = _$ownerProblemRequestKindEnum_problem;

  static Serializer<OwnerProblemRequestKindEnum> get serializer => _$ownerProblemRequestKindEnumSerializer;

  const OwnerProblemRequestKindEnum._(String name): super(name);

  static BuiltSet<OwnerProblemRequestKindEnum> get values => _$ownerProblemRequestKindEnumValues;
  static OwnerProblemRequestKindEnum valueOf(String name) => _$ownerProblemRequestKindEnumValueOf(name);
}
