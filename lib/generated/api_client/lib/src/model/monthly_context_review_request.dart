//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:built_collection/built_collection.dart';
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'monthly_context_review_request.g.dart';

/// MonthlyContextReviewRequest
///
/// Properties:
/// * [rubricVersion]
/// * [sourceRevisionId]
/// * [threadRevisionId]
/// * [parentRevisionId]
/// * [decision]
/// * [reasonCode]
/// * [evidenceReference] - Caller-supplied bounded opaque string stored as supplied; the API does not validate its target or sensitivity. Do not include raw content or secrets. This value is omitted from the response.
/// * [expectedRevision]
/// * [idempotencyKey]
@BuiltValue()
abstract class MonthlyContextReviewRequest implements Built<MonthlyContextReviewRequest, MonthlyContextReviewRequestBuilder> {
  @BuiltValueField(wireName: r'rubricVersion')
  String get rubricVersion;

  @BuiltValueField(wireName: r'sourceRevisionId')
  String get sourceRevisionId;

  @BuiltValueField(wireName: r'threadRevisionId')
  String get threadRevisionId;

  @BuiltValueField(wireName: r'parentRevisionId')
  String? get parentRevisionId;

  @BuiltValueField(wireName: r'decision')
  MonthlyContextReviewRequestDecisionEnum get decision;
  // enum decisionEnum {  accepted,  withheld,  reversed,  };

  @BuiltValueField(wireName: r'reasonCode')
  String get reasonCode;

  /// Caller-supplied bounded opaque string stored as supplied; the API does not validate its target or sensitivity. Do not include raw content or secrets. This value is omitted from the response.
  @BuiltValueField(wireName: r'evidenceReference')
  String get evidenceReference;

  @BuiltValueField(wireName: r'expectedRevision')
  int get expectedRevision;

  @BuiltValueField(wireName: r'idempotencyKey')
  String get idempotencyKey;

  MonthlyContextReviewRequest._();

  factory MonthlyContextReviewRequest([void updates(MonthlyContextReviewRequestBuilder b)]) = _$MonthlyContextReviewRequest;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(MonthlyContextReviewRequestBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<MonthlyContextReviewRequest> get serializer => _$MonthlyContextReviewRequestSerializer();
}

class _$MonthlyContextReviewRequestSerializer implements PrimitiveSerializer<MonthlyContextReviewRequest> {
  @override
  final Iterable<Type> types = const [MonthlyContextReviewRequest, _$MonthlyContextReviewRequest];

  @override
  final String wireName = r'MonthlyContextReviewRequest';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    MonthlyContextReviewRequest object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    yield r'rubricVersion';
    yield serializers.serialize(
      object.rubricVersion,
      specifiedType: const FullType(String),
    );
    yield r'sourceRevisionId';
    yield serializers.serialize(
      object.sourceRevisionId,
      specifiedType: const FullType(String),
    );
    yield r'threadRevisionId';
    yield serializers.serialize(
      object.threadRevisionId,
      specifiedType: const FullType(String),
    );
    yield r'parentRevisionId';
    yield object.parentRevisionId == null ? null : serializers.serialize(
      object.parentRevisionId,
      specifiedType: const FullType.nullable(String),
    );
    yield r'decision';
    yield serializers.serialize(
      object.decision,
      specifiedType: const FullType(MonthlyContextReviewRequestDecisionEnum),
    );
    yield r'reasonCode';
    yield serializers.serialize(
      object.reasonCode,
      specifiedType: const FullType(String),
    );
    yield r'evidenceReference';
    yield serializers.serialize(
      object.evidenceReference,
      specifiedType: const FullType(String),
    );
    yield r'expectedRevision';
    yield serializers.serialize(
      object.expectedRevision,
      specifiedType: const FullType(int),
    );
    yield r'idempotencyKey';
    yield serializers.serialize(
      object.idempotencyKey,
      specifiedType: const FullType(String),
    );
  }

  @override
  Object serialize(
    Serializers serializers,
    MonthlyContextReviewRequest object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required MonthlyContextReviewRequestBuilder result,
    required List<Object?> unhandled,
  }) {
    for (var i = 0; i < serializedList.length; i += 2) {
      final key = serializedList[i] as String;
      final value = serializedList[i + 1];
      switch (key) {
        case r'rubricVersion':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.rubricVersion = valueDes;
          break;
        case r'sourceRevisionId':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.sourceRevisionId = valueDes;
          break;
        case r'threadRevisionId':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.threadRevisionId = valueDes;
          break;
        case r'parentRevisionId':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType.nullable(String),
          ) as String?;
          if (valueDes == null) continue;
          result.parentRevisionId = valueDes;
          break;
        case r'decision':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(MonthlyContextReviewRequestDecisionEnum),
          ) as MonthlyContextReviewRequestDecisionEnum;
          result.decision = valueDes;
          break;
        case r'reasonCode':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.reasonCode = valueDes;
          break;
        case r'evidenceReference':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.evidenceReference = valueDes;
          break;
        case r'expectedRevision':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(int),
          ) as int;
          result.expectedRevision = valueDes;
          break;
        case r'idempotencyKey':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.idempotencyKey = valueDes;
          break;
        default:
          unhandled.add(key);
          unhandled.add(value);
          break;
      }
    }
  }

  @override
  MonthlyContextReviewRequest deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = MonthlyContextReviewRequestBuilder();
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

class MonthlyContextReviewRequestDecisionEnum extends EnumClass {

  @BuiltValueEnumConst(wireName: r'accepted')
  static const MonthlyContextReviewRequestDecisionEnum accepted = _$monthlyContextReviewRequestDecisionEnum_accepted;
  @BuiltValueEnumConst(wireName: r'withheld')
  static const MonthlyContextReviewRequestDecisionEnum withheld = _$monthlyContextReviewRequestDecisionEnum_withheld;
  @BuiltValueEnumConst(wireName: r'reversed')
  static const MonthlyContextReviewRequestDecisionEnum reversed = _$monthlyContextReviewRequestDecisionEnum_reversed;

  static Serializer<MonthlyContextReviewRequestDecisionEnum> get serializer => _$monthlyContextReviewRequestDecisionEnumSerializer;

  const MonthlyContextReviewRequestDecisionEnum._(String name): super(name);

  static BuiltSet<MonthlyContextReviewRequestDecisionEnum> get values => _$monthlyContextReviewRequestDecisionEnumValues;
  static MonthlyContextReviewRequestDecisionEnum valueOf(String name) => _$monthlyContextReviewRequestDecisionEnumValueOf(name);
}
