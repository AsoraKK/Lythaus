//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'admin_overview_gaps.g.dart';

/// AdminOverviewGaps
///
/// Properties:
/// * [newVerifiedUsers]
/// * [returningUsers]
/// * [retentionRate]
/// * [quietUsers]
/// * [upgrades]
/// * [cancellations]
/// * [revenue]
/// * [suspectedAiFlags]
/// * [confirmedAiClassifications]
/// * [appealOutcomes]
@BuiltValue()
abstract class AdminOverviewGaps implements Built<AdminOverviewGaps, AdminOverviewGapsBuilder> {
  @BuiltValueField(wireName: r'newVerifiedUsers')
  String get newVerifiedUsers;

  @BuiltValueField(wireName: r'returningUsers')
  String get returningUsers;

  @BuiltValueField(wireName: r'retentionRate')
  String get retentionRate;

  @BuiltValueField(wireName: r'quietUsers')
  String get quietUsers;

  @BuiltValueField(wireName: r'upgrades')
  String get upgrades;

  @BuiltValueField(wireName: r'cancellations')
  String get cancellations;

  @BuiltValueField(wireName: r'revenue')
  String get revenue;

  @BuiltValueField(wireName: r'suspectedAiFlags')
  String get suspectedAiFlags;

  @BuiltValueField(wireName: r'confirmedAiClassifications')
  String get confirmedAiClassifications;

  @BuiltValueField(wireName: r'appealOutcomes')
  String get appealOutcomes;

  AdminOverviewGaps._();

  factory AdminOverviewGaps([void updates(AdminOverviewGapsBuilder b)]) = _$AdminOverviewGaps;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(AdminOverviewGapsBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<AdminOverviewGaps> get serializer => _$AdminOverviewGapsSerializer();
}

class _$AdminOverviewGapsSerializer implements PrimitiveSerializer<AdminOverviewGaps> {
  @override
  final Iterable<Type> types = const [AdminOverviewGaps, _$AdminOverviewGaps];

  @override
  final String wireName = r'AdminOverviewGaps';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    AdminOverviewGaps object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    yield r'newVerifiedUsers';
    yield serializers.serialize(
      object.newVerifiedUsers,
      specifiedType: const FullType(String),
    );
    yield r'returningUsers';
    yield serializers.serialize(
      object.returningUsers,
      specifiedType: const FullType(String),
    );
    yield r'retentionRate';
    yield serializers.serialize(
      object.retentionRate,
      specifiedType: const FullType(String),
    );
    yield r'quietUsers';
    yield serializers.serialize(
      object.quietUsers,
      specifiedType: const FullType(String),
    );
    yield r'upgrades';
    yield serializers.serialize(
      object.upgrades,
      specifiedType: const FullType(String),
    );
    yield r'cancellations';
    yield serializers.serialize(
      object.cancellations,
      specifiedType: const FullType(String),
    );
    yield r'revenue';
    yield serializers.serialize(
      object.revenue,
      specifiedType: const FullType(String),
    );
    yield r'suspectedAiFlags';
    yield serializers.serialize(
      object.suspectedAiFlags,
      specifiedType: const FullType(String),
    );
    yield r'confirmedAiClassifications';
    yield serializers.serialize(
      object.confirmedAiClassifications,
      specifiedType: const FullType(String),
    );
    yield r'appealOutcomes';
    yield serializers.serialize(
      object.appealOutcomes,
      specifiedType: const FullType(String),
    );
  }

  @override
  Object serialize(
    Serializers serializers,
    AdminOverviewGaps object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required AdminOverviewGapsBuilder result,
    required List<Object?> unhandled,
  }) {
    for (var i = 0; i < serializedList.length; i += 2) {
      final key = serializedList[i] as String;
      final value = serializedList[i + 1];
      switch (key) {
        case r'newVerifiedUsers':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.newVerifiedUsers = valueDes;
          break;
        case r'returningUsers':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.returningUsers = valueDes;
          break;
        case r'retentionRate':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.retentionRate = valueDes;
          break;
        case r'quietUsers':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.quietUsers = valueDes;
          break;
        case r'upgrades':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.upgrades = valueDes;
          break;
        case r'cancellations':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.cancellations = valueDes;
          break;
        case r'revenue':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.revenue = valueDes;
          break;
        case r'suspectedAiFlags':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.suspectedAiFlags = valueDes;
          break;
        case r'confirmedAiClassifications':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.confirmedAiClassifications = valueDes;
          break;
        case r'appealOutcomes':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.appealOutcomes = valueDes;
          break;
        default:
          unhandled.add(key);
          unhandled.add(value);
          break;
      }
    }
  }

  @override
  AdminOverviewGaps deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = AdminOverviewGapsBuilder();
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
