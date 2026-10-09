//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:built_collection/built_collection.dart';
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'monthly_prepared_level_authority.g.dart';

/// MonthlyPreparedLevelAuthority
///
/// Properties:
/// * [state]
/// * [reasonCode]
/// * [effectiveMonth]
/// * [sourceMonth]
/// * [sourceScore]
/// * [level]
@BuiltValue()
abstract class MonthlyPreparedLevelAuthority implements Built<MonthlyPreparedLevelAuthority, MonthlyPreparedLevelAuthorityBuilder> {
  @BuiltValueField(wireName: r'state')
  MonthlyPreparedLevelAuthorityStateEnum get state;
  // enum stateEnum {  unavailable,  };

  @BuiltValueField(wireName: r'reasonCode')
  MonthlyPreparedLevelAuthorityReasonCodeEnum get reasonCode;
  // enum reasonCodeEnum {  activation_not_approved,  };

  @BuiltValueField(wireName: r'effectiveMonth')
  String get effectiveMonth;

  @BuiltValueField(wireName: r'sourceMonth')
  String? get sourceMonth;

  @BuiltValueField(wireName: r'sourceScore')
  int? get sourceScore;

  @BuiltValueField(wireName: r'level')
  int? get level;

  MonthlyPreparedLevelAuthority._();

  factory MonthlyPreparedLevelAuthority([void updates(MonthlyPreparedLevelAuthorityBuilder b)]) = _$MonthlyPreparedLevelAuthority;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(MonthlyPreparedLevelAuthorityBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<MonthlyPreparedLevelAuthority> get serializer => _$MonthlyPreparedLevelAuthoritySerializer();
}

class _$MonthlyPreparedLevelAuthoritySerializer implements PrimitiveSerializer<MonthlyPreparedLevelAuthority> {
  @override
  final Iterable<Type> types = const [MonthlyPreparedLevelAuthority, _$MonthlyPreparedLevelAuthority];

  @override
  final String wireName = r'MonthlyPreparedLevelAuthority';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    MonthlyPreparedLevelAuthority object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    yield r'state';
    yield serializers.serialize(
      object.state,
      specifiedType: const FullType(MonthlyPreparedLevelAuthorityStateEnum),
    );
    yield r'reasonCode';
    yield serializers.serialize(
      object.reasonCode,
      specifiedType: const FullType(MonthlyPreparedLevelAuthorityReasonCodeEnum),
    );
    yield r'effectiveMonth';
    yield serializers.serialize(
      object.effectiveMonth,
      specifiedType: const FullType(String),
    );
    yield r'sourceMonth';
    yield object.sourceMonth == null ? null : serializers.serialize(
      object.sourceMonth,
      specifiedType: const FullType.nullable(String),
    );
    yield r'sourceScore';
    yield object.sourceScore == null ? null : serializers.serialize(
      object.sourceScore,
      specifiedType: const FullType.nullable(int),
    );
    yield r'level';
    yield object.level == null ? null : serializers.serialize(
      object.level,
      specifiedType: const FullType.nullable(int),
    );
  }

  @override
  Object serialize(
    Serializers serializers,
    MonthlyPreparedLevelAuthority object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required MonthlyPreparedLevelAuthorityBuilder result,
    required List<Object?> unhandled,
  }) {
    for (var i = 0; i < serializedList.length; i += 2) {
      final key = serializedList[i] as String;
      final value = serializedList[i + 1];
      switch (key) {
        case r'state':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(MonthlyPreparedLevelAuthorityStateEnum),
          ) as MonthlyPreparedLevelAuthorityStateEnum;
          result.state = valueDes;
          break;
        case r'reasonCode':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(MonthlyPreparedLevelAuthorityReasonCodeEnum),
          ) as MonthlyPreparedLevelAuthorityReasonCodeEnum;
          result.reasonCode = valueDes;
          break;
        case r'effectiveMonth':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.effectiveMonth = valueDes;
          break;
        case r'sourceMonth':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType.nullable(String),
          ) as String?;
          if (valueDes == null) continue;
          result.sourceMonth = valueDes;
          break;
        case r'sourceScore':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType.nullable(int),
          ) as int?;
          if (valueDes == null) continue;
          result.sourceScore = valueDes;
          break;
        case r'level':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType.nullable(int),
          ) as int?;
          if (valueDes == null) continue;
          result.level = valueDes;
          break;
        default:
          unhandled.add(key);
          unhandled.add(value);
          break;
      }
    }
  }

  @override
  MonthlyPreparedLevelAuthority deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = MonthlyPreparedLevelAuthorityBuilder();
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

class MonthlyPreparedLevelAuthorityStateEnum extends EnumClass {

  @BuiltValueEnumConst(wireName: r'unavailable')
  static const MonthlyPreparedLevelAuthorityStateEnum unavailable = _$monthlyPreparedLevelAuthorityStateEnum_unavailable;

  static Serializer<MonthlyPreparedLevelAuthorityStateEnum> get serializer => _$monthlyPreparedLevelAuthorityStateEnumSerializer;

  const MonthlyPreparedLevelAuthorityStateEnum._(String name): super(name);

  static BuiltSet<MonthlyPreparedLevelAuthorityStateEnum> get values => _$monthlyPreparedLevelAuthorityStateEnumValues;
  static MonthlyPreparedLevelAuthorityStateEnum valueOf(String name) => _$monthlyPreparedLevelAuthorityStateEnumValueOf(name);
}

class MonthlyPreparedLevelAuthorityReasonCodeEnum extends EnumClass {

  @BuiltValueEnumConst(wireName: r'activation_not_approved')
  static const MonthlyPreparedLevelAuthorityReasonCodeEnum activationNotApproved = _$monthlyPreparedLevelAuthorityReasonCodeEnum_activationNotApproved;

  static Serializer<MonthlyPreparedLevelAuthorityReasonCodeEnum> get serializer => _$monthlyPreparedLevelAuthorityReasonCodeEnumSerializer;

  const MonthlyPreparedLevelAuthorityReasonCodeEnum._(String name): super(name);

  static BuiltSet<MonthlyPreparedLevelAuthorityReasonCodeEnum> get values => _$monthlyPreparedLevelAuthorityReasonCodeEnumValues;
  static MonthlyPreparedLevelAuthorityReasonCodeEnum valueOf(String name) => _$monthlyPreparedLevelAuthorityReasonCodeEnumValueOf(name);
}
