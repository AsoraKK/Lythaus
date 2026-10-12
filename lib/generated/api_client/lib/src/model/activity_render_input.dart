//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:built_collection/built_collection.dart';
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'activity_render_input.g.dart';

/// ActivityRenderInput
///
/// Properties:
/// * [signal]
/// * [consentRevision]
/// * [consentEpoch]
/// * [accountScope]
/// * [noticeVersion]
@BuiltValue()
abstract class ActivityRenderInput implements Built<ActivityRenderInput, ActivityRenderInputBuilder> {
  @BuiltValueField(wireName: r'signal')
  ActivityRenderInputSignalEnum get signal;
  // enum signalEnum {  foreground_app_render,  };

  @BuiltValueField(wireName: r'consentRevision')
  int get consentRevision;

  @BuiltValueField(wireName: r'consentEpoch')
  String get consentEpoch;

  @BuiltValueField(wireName: r'accountScope')
  String get accountScope;

  @BuiltValueField(wireName: r'noticeVersion')
  ActivityRenderInputNoticeVersionEnum get noticeVersion;
  // enum noticeVersionEnum {  activity-account-day-v1,  };

  ActivityRenderInput._();

  factory ActivityRenderInput([void updates(ActivityRenderInputBuilder b)]) = _$ActivityRenderInput;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(ActivityRenderInputBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<ActivityRenderInput> get serializer => _$ActivityRenderInputSerializer();
}

class _$ActivityRenderInputSerializer implements PrimitiveSerializer<ActivityRenderInput> {
  @override
  final Iterable<Type> types = const [ActivityRenderInput, _$ActivityRenderInput];

  @override
  final String wireName = r'ActivityRenderInput';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    ActivityRenderInput object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    yield r'signal';
    yield serializers.serialize(
      object.signal,
      specifiedType: const FullType(ActivityRenderInputSignalEnum),
    );
    yield r'consentRevision';
    yield serializers.serialize(
      object.consentRevision,
      specifiedType: const FullType(int),
    );
    yield r'consentEpoch';
    yield serializers.serialize(
      object.consentEpoch,
      specifiedType: const FullType(String),
    );
    yield r'accountScope';
    yield serializers.serialize(
      object.accountScope,
      specifiedType: const FullType(String),
    );
    yield r'noticeVersion';
    yield serializers.serialize(
      object.noticeVersion,
      specifiedType: const FullType(ActivityRenderInputNoticeVersionEnum),
    );
  }

  @override
  Object serialize(
    Serializers serializers,
    ActivityRenderInput object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required ActivityRenderInputBuilder result,
    required List<Object?> unhandled,
  }) {
    for (var i = 0; i < serializedList.length; i += 2) {
      final key = serializedList[i] as String;
      final value = serializedList[i + 1];
      switch (key) {
        case r'signal':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(ActivityRenderInputSignalEnum),
          ) as ActivityRenderInputSignalEnum;
          result.signal = valueDes;
          break;
        case r'consentRevision':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(int),
          ) as int;
          result.consentRevision = valueDes;
          break;
        case r'consentEpoch':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.consentEpoch = valueDes;
          break;
        case r'accountScope':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.accountScope = valueDes;
          break;
        case r'noticeVersion':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(ActivityRenderInputNoticeVersionEnum),
          ) as ActivityRenderInputNoticeVersionEnum;
          result.noticeVersion = valueDes;
          break;
        default:
          unhandled.add(key);
          unhandled.add(value);
          break;
      }
    }
  }

  @override
  ActivityRenderInput deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = ActivityRenderInputBuilder();
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

class ActivityRenderInputSignalEnum extends EnumClass {

  @BuiltValueEnumConst(wireName: r'foreground_app_render')
  static const ActivityRenderInputSignalEnum foregroundAppRender = _$activityRenderInputSignalEnum_foregroundAppRender;

  static Serializer<ActivityRenderInputSignalEnum> get serializer => _$activityRenderInputSignalEnumSerializer;

  const ActivityRenderInputSignalEnum._(String name): super(name);

  static BuiltSet<ActivityRenderInputSignalEnum> get values => _$activityRenderInputSignalEnumValues;
  static ActivityRenderInputSignalEnum valueOf(String name) => _$activityRenderInputSignalEnumValueOf(name);
}

class ActivityRenderInputNoticeVersionEnum extends EnumClass {

  @BuiltValueEnumConst(wireName: r'activity-account-day-v1')
  static const ActivityRenderInputNoticeVersionEnum activityAccountDayV1 = _$activityRenderInputNoticeVersionEnum_activityAccountDayV1;

  static Serializer<ActivityRenderInputNoticeVersionEnum> get serializer => _$activityRenderInputNoticeVersionEnumSerializer;

  const ActivityRenderInputNoticeVersionEnum._(String name): super(name);

  static BuiltSet<ActivityRenderInputNoticeVersionEnum> get values => _$activityRenderInputNoticeVersionEnumValues;
  static ActivityRenderInputNoticeVersionEnum valueOf(String name) => _$activityRenderInputNoticeVersionEnumValueOf(name);
}
