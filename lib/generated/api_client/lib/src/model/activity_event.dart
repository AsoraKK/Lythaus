//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:built_collection/built_collection.dart';
import 'package:built_value/json_object.dart';
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'activity_event.g.dart';

/// ActivityEvent
///
/// Properties:
/// * [id]
/// * [userId]
/// * [actorUserId]
/// * [eventType]
/// * [category]
/// * [source_]
/// * [sourceEventId]
/// * [correlationId]
/// * [title]
/// * [explanation]
/// * [result]
/// * [reasonCode]
/// * [policyVersion]
/// * [objectType]
/// * [objectId]
/// * [reputationEffect]
/// * [appealable]
/// * [retentionClass]
/// * [metadata]
/// * [retentionDays]
/// * [createdAt]
@BuiltValue()
abstract class ActivityEvent implements Built<ActivityEvent, ActivityEventBuilder> {
  @BuiltValueField(wireName: r'id')
  String get id;

  @BuiltValueField(wireName: r'userId')
  String get userId;

  @BuiltValueField(wireName: r'actorUserId')
  String? get actorUserId;

  @BuiltValueField(wireName: r'eventType')
  String get eventType;

  @BuiltValueField(wireName: r'category')
  ActivityEventCategoryEnum get category;
  // enum categoryEnum {  account,  content,  social,  reputation,  moderation,  appeals,  privacy,  rewards,  };

  @BuiltValueField(wireName: r'source')
  ActivityEventSource_Enum get source_;
  // enum source_Enum {  public_api,  admin_api,  jobs,  workflow,  system,  };

  @BuiltValueField(wireName: r'sourceEventId')
  String get sourceEventId;

  @BuiltValueField(wireName: r'correlationId')
  String get correlationId;

  @BuiltValueField(wireName: r'title')
  String get title;

  @BuiltValueField(wireName: r'explanation')
  String get explanation;

  @BuiltValueField(wireName: r'result')
  ActivityEventResultEnum get result;
  // enum resultEnum {  succeeded,  failed,  withheld,  reversed,  pending,  };

  @BuiltValueField(wireName: r'reasonCode')
  String? get reasonCode;

  @BuiltValueField(wireName: r'policyVersion')
  String get policyVersion;

  @BuiltValueField(wireName: r'objectType')
  String? get objectType;

  @BuiltValueField(wireName: r'objectId')
  String? get objectId;

  @BuiltValueField(wireName: r'reputationEffect')
  ActivityEventReputationEffectEnum get reputationEffect;
  // enum reputationEffectEnum {  none,  positive,  negative,  reversed,  withheld,  };

  @BuiltValueField(wireName: r'appealable')
  bool get appealable;

  @BuiltValueField(wireName: r'retentionClass')
  ActivityEventRetentionClassEnum get retentionClass;
  // enum retentionClassEnum {  ordinary,  security,  moderation,  };

  @BuiltValueField(wireName: r'metadata')
  BuiltMap<String, JsonObject?> get metadata;

  @BuiltValueField(wireName: r'retentionDays')
  ActivityEventRetentionDaysEnum get retentionDays;
  // enum retentionDaysEnum {  90,  365,  730,  };

  @BuiltValueField(wireName: r'createdAt')
  DateTime get createdAt;

  ActivityEvent._();

  factory ActivityEvent([void updates(ActivityEventBuilder b)]) = _$ActivityEvent;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(ActivityEventBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<ActivityEvent> get serializer => _$ActivityEventSerializer();
}

class _$ActivityEventSerializer implements PrimitiveSerializer<ActivityEvent> {
  @override
  final Iterable<Type> types = const [ActivityEvent, _$ActivityEvent];

  @override
  final String wireName = r'ActivityEvent';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    ActivityEvent object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    yield r'id';
    yield serializers.serialize(
      object.id,
      specifiedType: const FullType(String),
    );
    yield r'userId';
    yield serializers.serialize(
      object.userId,
      specifiedType: const FullType(String),
    );
    if (object.actorUserId != null) {
      yield r'actorUserId';
      yield serializers.serialize(
        object.actorUserId,
        specifiedType: const FullType.nullable(String),
      );
    }
    yield r'eventType';
    yield serializers.serialize(
      object.eventType,
      specifiedType: const FullType(String),
    );
    yield r'category';
    yield serializers.serialize(
      object.category,
      specifiedType: const FullType(ActivityEventCategoryEnum),
    );
    yield r'source';
    yield serializers.serialize(
      object.source_,
      specifiedType: const FullType(ActivityEventSource_Enum),
    );
    yield r'sourceEventId';
    yield serializers.serialize(
      object.sourceEventId,
      specifiedType: const FullType(String),
    );
    yield r'correlationId';
    yield serializers.serialize(
      object.correlationId,
      specifiedType: const FullType(String),
    );
    yield r'title';
    yield serializers.serialize(
      object.title,
      specifiedType: const FullType(String),
    );
    yield r'explanation';
    yield serializers.serialize(
      object.explanation,
      specifiedType: const FullType(String),
    );
    yield r'result';
    yield serializers.serialize(
      object.result,
      specifiedType: const FullType(ActivityEventResultEnum),
    );
    if (object.reasonCode != null) {
      yield r'reasonCode';
      yield serializers.serialize(
        object.reasonCode,
        specifiedType: const FullType.nullable(String),
      );
    }
    yield r'policyVersion';
    yield serializers.serialize(
      object.policyVersion,
      specifiedType: const FullType(String),
    );
    if (object.objectType != null) {
      yield r'objectType';
      yield serializers.serialize(
        object.objectType,
        specifiedType: const FullType.nullable(String),
      );
    }
    if (object.objectId != null) {
      yield r'objectId';
      yield serializers.serialize(
        object.objectId,
        specifiedType: const FullType.nullable(String),
      );
    }
    yield r'reputationEffect';
    yield serializers.serialize(
      object.reputationEffect,
      specifiedType: const FullType(ActivityEventReputationEffectEnum),
    );
    yield r'appealable';
    yield serializers.serialize(
      object.appealable,
      specifiedType: const FullType(bool),
    );
    yield r'retentionClass';
    yield serializers.serialize(
      object.retentionClass,
      specifiedType: const FullType(ActivityEventRetentionClassEnum),
    );
    yield r'metadata';
    yield serializers.serialize(
      object.metadata,
      specifiedType: const FullType(BuiltMap, [FullType(String), FullType.nullable(JsonObject)]),
    );
    yield r'retentionDays';
    yield serializers.serialize(
      object.retentionDays,
      specifiedType: const FullType(ActivityEventRetentionDaysEnum),
    );
    yield r'createdAt';
    yield serializers.serialize(
      object.createdAt,
      specifiedType: const FullType(DateTime),
    );
  }

  @override
  Object serialize(
    Serializers serializers,
    ActivityEvent object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required ActivityEventBuilder result,
    required List<Object?> unhandled,
  }) {
    for (var i = 0; i < serializedList.length; i += 2) {
      final key = serializedList[i] as String;
      final value = serializedList[i + 1];
      switch (key) {
        case r'id':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.id = valueDes;
          break;
        case r'userId':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.userId = valueDes;
          break;
        case r'actorUserId':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType.nullable(String),
          ) as String?;
          if (valueDes == null) continue;
          result.actorUserId = valueDes;
          break;
        case r'eventType':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.eventType = valueDes;
          break;
        case r'category':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(ActivityEventCategoryEnum),
          ) as ActivityEventCategoryEnum;
          result.category = valueDes;
          break;
        case r'source':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(ActivityEventSource_Enum),
          ) as ActivityEventSource_Enum;
          result.source_ = valueDes;
          break;
        case r'sourceEventId':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.sourceEventId = valueDes;
          break;
        case r'correlationId':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.correlationId = valueDes;
          break;
        case r'title':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.title = valueDes;
          break;
        case r'explanation':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.explanation = valueDes;
          break;
        case r'result':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(ActivityEventResultEnum),
          ) as ActivityEventResultEnum;
          result.result = valueDes;
          break;
        case r'reasonCode':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType.nullable(String),
          ) as String?;
          if (valueDes == null) continue;
          result.reasonCode = valueDes;
          break;
        case r'policyVersion':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.policyVersion = valueDes;
          break;
        case r'objectType':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType.nullable(String),
          ) as String?;
          if (valueDes == null) continue;
          result.objectType = valueDes;
          break;
        case r'objectId':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType.nullable(String),
          ) as String?;
          if (valueDes == null) continue;
          result.objectId = valueDes;
          break;
        case r'reputationEffect':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(ActivityEventReputationEffectEnum),
          ) as ActivityEventReputationEffectEnum;
          result.reputationEffect = valueDes;
          break;
        case r'appealable':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(bool),
          ) as bool;
          result.appealable = valueDes;
          break;
        case r'retentionClass':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(ActivityEventRetentionClassEnum),
          ) as ActivityEventRetentionClassEnum;
          result.retentionClass = valueDes;
          break;
        case r'metadata':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(BuiltMap, [FullType(String), FullType.nullable(JsonObject)]),
          ) as BuiltMap<String, JsonObject?>;
          result.metadata.replace(valueDes);
          break;
        case r'retentionDays':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(ActivityEventRetentionDaysEnum),
          ) as ActivityEventRetentionDaysEnum;
          result.retentionDays = valueDes;
          break;
        case r'createdAt':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(DateTime),
          ) as DateTime;
          result.createdAt = valueDes;
          break;
        default:
          unhandled.add(key);
          unhandled.add(value);
          break;
      }
    }
  }

  @override
  ActivityEvent deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = ActivityEventBuilder();
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

class ActivityEventCategoryEnum extends EnumClass {

  @BuiltValueEnumConst(wireName: r'account')
  static const ActivityEventCategoryEnum account = _$activityEventCategoryEnum_account;
  @BuiltValueEnumConst(wireName: r'content')
  static const ActivityEventCategoryEnum content = _$activityEventCategoryEnum_content;
  @BuiltValueEnumConst(wireName: r'social')
  static const ActivityEventCategoryEnum social = _$activityEventCategoryEnum_social;
  @BuiltValueEnumConst(wireName: r'reputation')
  static const ActivityEventCategoryEnum reputation = _$activityEventCategoryEnum_reputation;
  @BuiltValueEnumConst(wireName: r'moderation')
  static const ActivityEventCategoryEnum moderation = _$activityEventCategoryEnum_moderation;
  @BuiltValueEnumConst(wireName: r'appeals')
  static const ActivityEventCategoryEnum appeals = _$activityEventCategoryEnum_appeals;
  @BuiltValueEnumConst(wireName: r'privacy')
  static const ActivityEventCategoryEnum privacy = _$activityEventCategoryEnum_privacy;
  @BuiltValueEnumConst(wireName: r'rewards')
  static const ActivityEventCategoryEnum rewards = _$activityEventCategoryEnum_rewards;

  static Serializer<ActivityEventCategoryEnum> get serializer => _$activityEventCategoryEnumSerializer;

  const ActivityEventCategoryEnum._(String name): super(name);

  static BuiltSet<ActivityEventCategoryEnum> get values => _$activityEventCategoryEnumValues;
  static ActivityEventCategoryEnum valueOf(String name) => _$activityEventCategoryEnumValueOf(name);
}

class ActivityEventSource_Enum extends EnumClass {

  @BuiltValueEnumConst(wireName: r'public_api')
  static const ActivityEventSource_Enum publicApi = _$activityEventSourceEnum_publicApi;
  @BuiltValueEnumConst(wireName: r'admin_api')
  static const ActivityEventSource_Enum adminApi = _$activityEventSourceEnum_adminApi;
  @BuiltValueEnumConst(wireName: r'jobs')
  static const ActivityEventSource_Enum jobs = _$activityEventSourceEnum_jobs;
  @BuiltValueEnumConst(wireName: r'workflow')
  static const ActivityEventSource_Enum workflow = _$activityEventSourceEnum_workflow;
  @BuiltValueEnumConst(wireName: r'system')
  static const ActivityEventSource_Enum system = _$activityEventSourceEnum_system;

  static Serializer<ActivityEventSource_Enum> get serializer => _$activityEventSourceEnumSerializer;

  const ActivityEventSource_Enum._(String name): super(name);

  static BuiltSet<ActivityEventSource_Enum> get values => _$activityEventSourceEnumValues;
  static ActivityEventSource_Enum valueOf(String name) => _$activityEventSourceEnumValueOf(name);
}

class ActivityEventResultEnum extends EnumClass {

  @BuiltValueEnumConst(wireName: r'succeeded')
  static const ActivityEventResultEnum succeeded = _$activityEventResultEnum_succeeded;
  @BuiltValueEnumConst(wireName: r'failed')
  static const ActivityEventResultEnum failed = _$activityEventResultEnum_failed;
  @BuiltValueEnumConst(wireName: r'withheld')
  static const ActivityEventResultEnum withheld = _$activityEventResultEnum_withheld;
  @BuiltValueEnumConst(wireName: r'reversed')
  static const ActivityEventResultEnum reversed = _$activityEventResultEnum_reversed;
  @BuiltValueEnumConst(wireName: r'pending')
  static const ActivityEventResultEnum pending = _$activityEventResultEnum_pending;

  static Serializer<ActivityEventResultEnum> get serializer => _$activityEventResultEnumSerializer;

  const ActivityEventResultEnum._(String name): super(name);

  static BuiltSet<ActivityEventResultEnum> get values => _$activityEventResultEnumValues;
  static ActivityEventResultEnum valueOf(String name) => _$activityEventResultEnumValueOf(name);
}

class ActivityEventReputationEffectEnum extends EnumClass {

  @BuiltValueEnumConst(wireName: r'none')
  static const ActivityEventReputationEffectEnum none = _$activityEventReputationEffectEnum_none;
  @BuiltValueEnumConst(wireName: r'positive')
  static const ActivityEventReputationEffectEnum positive = _$activityEventReputationEffectEnum_positive;
  @BuiltValueEnumConst(wireName: r'negative')
  static const ActivityEventReputationEffectEnum negative = _$activityEventReputationEffectEnum_negative;
  @BuiltValueEnumConst(wireName: r'reversed')
  static const ActivityEventReputationEffectEnum reversed = _$activityEventReputationEffectEnum_reversed;
  @BuiltValueEnumConst(wireName: r'withheld')
  static const ActivityEventReputationEffectEnum withheld = _$activityEventReputationEffectEnum_withheld;

  static Serializer<ActivityEventReputationEffectEnum> get serializer => _$activityEventReputationEffectEnumSerializer;

  const ActivityEventReputationEffectEnum._(String name): super(name);

  static BuiltSet<ActivityEventReputationEffectEnum> get values => _$activityEventReputationEffectEnumValues;
  static ActivityEventReputationEffectEnum valueOf(String name) => _$activityEventReputationEffectEnumValueOf(name);
}

class ActivityEventRetentionClassEnum extends EnumClass {

  @BuiltValueEnumConst(wireName: r'ordinary')
  static const ActivityEventRetentionClassEnum ordinary = _$activityEventRetentionClassEnum_ordinary;
  @BuiltValueEnumConst(wireName: r'security')
  static const ActivityEventRetentionClassEnum security = _$activityEventRetentionClassEnum_security;
  @BuiltValueEnumConst(wireName: r'moderation')
  static const ActivityEventRetentionClassEnum moderation = _$activityEventRetentionClassEnum_moderation;

  static Serializer<ActivityEventRetentionClassEnum> get serializer => _$activityEventRetentionClassEnumSerializer;

  const ActivityEventRetentionClassEnum._(String name): super(name);

  static BuiltSet<ActivityEventRetentionClassEnum> get values => _$activityEventRetentionClassEnumValues;
  static ActivityEventRetentionClassEnum valueOf(String name) => _$activityEventRetentionClassEnumValueOf(name);
}

class ActivityEventRetentionDaysEnum extends EnumClass {

  @BuiltValueEnumConst(wireNumber: 90)
  static const ActivityEventRetentionDaysEnum number90 = _$activityEventRetentionDaysEnum_number90;
  @BuiltValueEnumConst(wireNumber: 365)
  static const ActivityEventRetentionDaysEnum number365 = _$activityEventRetentionDaysEnum_number365;
  @BuiltValueEnumConst(wireNumber: 730)
  static const ActivityEventRetentionDaysEnum number730 = _$activityEventRetentionDaysEnum_number730;

  static Serializer<ActivityEventRetentionDaysEnum> get serializer => _$activityEventRetentionDaysEnumSerializer;

  const ActivityEventRetentionDaysEnum._(String name): super(name);

  static BuiltSet<ActivityEventRetentionDaysEnum> get values => _$activityEventRetentionDaysEnumValues;
  static ActivityEventRetentionDaysEnum valueOf(String name) => _$activityEventRetentionDaysEnumValueOf(name);
}
