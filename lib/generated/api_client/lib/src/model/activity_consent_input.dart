//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:built_collection/built_collection.dart';
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'activity_consent_input.g.dart';

/// ActivityConsentInput
///
/// Properties:
/// * [enabled]
/// * [expectedRevision]
/// * [expectedEpoch] - Null only at revision zero.
/// * [accountScope] - Server-issued purpose-specific account scope; never raw account identity.
/// * [noticeVersion]
@BuiltValue()
abstract class ActivityConsentInput implements Built<ActivityConsentInput, ActivityConsentInputBuilder> {
  @BuiltValueField(wireName: r'enabled')
  bool get enabled;

  @BuiltValueField(wireName: r'expectedRevision')
  int get expectedRevision;

  /// Null only at revision zero.
  @BuiltValueField(wireName: r'expectedEpoch')
  String? get expectedEpoch;

  /// Server-issued purpose-specific account scope; never raw account identity.
  @BuiltValueField(wireName: r'accountScope')
  String get accountScope;

  @BuiltValueField(wireName: r'noticeVersion')
  ActivityConsentInputNoticeVersionEnum get noticeVersion;
  // enum noticeVersionEnum {  activity-account-day-v1,  };

  ActivityConsentInput._();

  factory ActivityConsentInput([void updates(ActivityConsentInputBuilder b)]) = _$ActivityConsentInput;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(ActivityConsentInputBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<ActivityConsentInput> get serializer => _$ActivityConsentInputSerializer();
}

class _$ActivityConsentInputSerializer implements PrimitiveSerializer<ActivityConsentInput> {
  @override
  final Iterable<Type> types = const [ActivityConsentInput, _$ActivityConsentInput];

  @override
  final String wireName = r'ActivityConsentInput';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    ActivityConsentInput object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    yield r'enabled';
    yield serializers.serialize(
      object.enabled,
      specifiedType: const FullType(bool),
    );
    yield r'expectedRevision';
    yield serializers.serialize(
      object.expectedRevision,
      specifiedType: const FullType(int),
    );
    yield r'expectedEpoch';
    yield object.expectedEpoch == null ? null : serializers.serialize(
      object.expectedEpoch,
      specifiedType: const FullType.nullable(String),
    );
    yield r'accountScope';
    yield serializers.serialize(
      object.accountScope,
      specifiedType: const FullType(String),
    );
    yield r'noticeVersion';
    yield serializers.serialize(
      object.noticeVersion,
      specifiedType: const FullType(ActivityConsentInputNoticeVersionEnum),
    );
  }

  @override
  Object serialize(
    Serializers serializers,
    ActivityConsentInput object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required ActivityConsentInputBuilder result,
    required List<Object?> unhandled,
  }) {
    for (var i = 0; i < serializedList.length; i += 2) {
      final key = serializedList[i] as String;
      final value = serializedList[i + 1];
      switch (key) {
        case r'enabled':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(bool),
          ) as bool;
          result.enabled = valueDes;
          break;
        case r'expectedRevision':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(int),
          ) as int;
          result.expectedRevision = valueDes;
          break;
        case r'expectedEpoch':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType.nullable(String),
          ) as String?;
          if (valueDes == null) continue;
          result.expectedEpoch = valueDes;
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
            specifiedType: const FullType(ActivityConsentInputNoticeVersionEnum),
          ) as ActivityConsentInputNoticeVersionEnum;
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
  ActivityConsentInput deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = ActivityConsentInputBuilder();
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

class ActivityConsentInputNoticeVersionEnum extends EnumClass {

  @BuiltValueEnumConst(wireName: r'activity-account-day-v1')
  static const ActivityConsentInputNoticeVersionEnum activityAccountDayV1 = _$activityConsentInputNoticeVersionEnum_activityAccountDayV1;

  static Serializer<ActivityConsentInputNoticeVersionEnum> get serializer => _$activityConsentInputNoticeVersionEnumSerializer;

  const ActivityConsentInputNoticeVersionEnum._(String name): super(name);

  static BuiltSet<ActivityConsentInputNoticeVersionEnum> get values => _$activityConsentInputNoticeVersionEnumValues;
  static ActivityConsentInputNoticeVersionEnum valueOf(String name) => _$activityConsentInputNoticeVersionEnumValueOf(name);
}
