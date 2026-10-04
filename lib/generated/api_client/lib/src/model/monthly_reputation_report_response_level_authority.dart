//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:built_collection/built_collection.dart';
import 'package:built_value/json_object.dart';
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'monthly_reputation_report_response_level_authority.g.dart';

/// MonthlyReputationReportResponseLevelAuthority
///
/// Properties:
/// * [state]
/// * [reasonCode]
/// * [effectiveMonth]
/// * [sourceMonth]
/// * [sourceScore]
/// * [level]
/// * [levelKind]
@BuiltValue()
abstract class MonthlyReputationReportResponseLevelAuthority implements Built<MonthlyReputationReportResponseLevelAuthority, MonthlyReputationReportResponseLevelAuthorityBuilder> {
  @BuiltValueField(wireName: r'state')
  String get state;

  @BuiltValueField(wireName: r'reasonCode')
  String? get reasonCode;

  @BuiltValueField(wireName: r'effectiveMonth')
  String? get effectiveMonth;

  @BuiltValueField(wireName: r'sourceMonth')
  String? get sourceMonth;

  @BuiltValueField(wireName: r'sourceScore')
  int? get sourceScore;

  @BuiltValueField(wireName: r'level')
  int? get level;

  @BuiltValueField(wireName: r'levelKind')
  String? get levelKind;

  MonthlyReputationReportResponseLevelAuthority._();

  factory MonthlyReputationReportResponseLevelAuthority([void updates(MonthlyReputationReportResponseLevelAuthorityBuilder b)]) = _$MonthlyReputationReportResponseLevelAuthority;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(MonthlyReputationReportResponseLevelAuthorityBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<MonthlyReputationReportResponseLevelAuthority> get serializer => _$MonthlyReputationReportResponseLevelAuthoritySerializer();
}

class _$MonthlyReputationReportResponseLevelAuthoritySerializer implements PrimitiveSerializer<MonthlyReputationReportResponseLevelAuthority> {
  @override
  final Iterable<Type> types = const [MonthlyReputationReportResponseLevelAuthority, _$MonthlyReputationReportResponseLevelAuthority];

  @override
  final String wireName = r'MonthlyReputationReportResponseLevelAuthority';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    MonthlyReputationReportResponseLevelAuthority object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    yield r'state';
    yield serializers.serialize(
      object.state,
      specifiedType: const FullType(String),
    );
    if (object.reasonCode != null) {
      yield r'reasonCode';
      yield serializers.serialize(
        object.reasonCode,
        specifiedType: const FullType.nullable(String),
      );
    }
    yield r'effectiveMonth';
    yield object.effectiveMonth == null ? null : serializers.serialize(
      object.effectiveMonth,
      specifiedType: const FullType.nullable(String),
    );
    if (object.sourceMonth != null) {
      yield r'sourceMonth';
      yield serializers.serialize(
        object.sourceMonth,
        specifiedType: const FullType.nullable(String),
      );
    }
    if (object.sourceScore != null) {
      yield r'sourceScore';
      yield serializers.serialize(
        object.sourceScore,
        specifiedType: const FullType.nullable(int),
      );
    }
    if (object.level != null) {
      yield r'level';
      yield serializers.serialize(
        object.level,
        specifiedType: const FullType.nullable(int),
      );
    }
    if (object.levelKind != null) {
      yield r'levelKind';
      yield serializers.serialize(
        object.levelKind,
        specifiedType: const FullType.nullable(String),
      );
    }
  }

  @override
  Object serialize(
    Serializers serializers,
    MonthlyReputationReportResponseLevelAuthority object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required MonthlyReputationReportResponseLevelAuthorityBuilder result,
    required List<Object?> unhandled,
  }) {
    for (var i = 0; i < serializedList.length; i += 2) {
      final key = serializedList[i] as String;
      final value = serializedList[i + 1];
      switch (key) {
        case r'state':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.state = valueDes;
          break;
        case r'reasonCode':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType.nullable(String),
          ) as String?;
          if (valueDes == null) continue;
          result.reasonCode = valueDes;
          break;
        case r'effectiveMonth':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType.nullable(String),
          ) as String?;
          if (valueDes == null) continue;
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
        case r'levelKind':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType.nullable(String),
          ) as String?;
          if (valueDes == null) continue;
          result.levelKind = valueDes;
          break;
        default:
          unhandled.add(key);
          unhandled.add(value);
          break;
      }
    }
  }

  @override
  MonthlyReputationReportResponseLevelAuthority deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = MonthlyReputationReportResponseLevelAuthorityBuilder();
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
