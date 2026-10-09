//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:built_collection/built_collection.dart';
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'monthly_prepared_unavailable_snapshot.g.dart';

/// MonthlyPreparedUnavailableSnapshot
///
/// Properties:
/// * [state]
/// * [reasonCode]
@BuiltValue()
abstract class MonthlyPreparedUnavailableSnapshot implements Built<MonthlyPreparedUnavailableSnapshot, MonthlyPreparedUnavailableSnapshotBuilder> {
  @BuiltValueField(wireName: r'state')
  MonthlyPreparedUnavailableSnapshotStateEnum get state;
  // enum stateEnum {  unavailable,  };

  @BuiltValueField(wireName: r'reasonCode')
  MonthlyPreparedUnavailableSnapshotReasonCodeEnum get reasonCode;
  // enum reasonCodeEnum {  activation_not_approved,  };

  MonthlyPreparedUnavailableSnapshot._();

  factory MonthlyPreparedUnavailableSnapshot([void updates(MonthlyPreparedUnavailableSnapshotBuilder b)]) = _$MonthlyPreparedUnavailableSnapshot;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(MonthlyPreparedUnavailableSnapshotBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<MonthlyPreparedUnavailableSnapshot> get serializer => _$MonthlyPreparedUnavailableSnapshotSerializer();
}

class _$MonthlyPreparedUnavailableSnapshotSerializer implements PrimitiveSerializer<MonthlyPreparedUnavailableSnapshot> {
  @override
  final Iterable<Type> types = const [MonthlyPreparedUnavailableSnapshot, _$MonthlyPreparedUnavailableSnapshot];

  @override
  final String wireName = r'MonthlyPreparedUnavailableSnapshot';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    MonthlyPreparedUnavailableSnapshot object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    yield r'state';
    yield serializers.serialize(
      object.state,
      specifiedType: const FullType(MonthlyPreparedUnavailableSnapshotStateEnum),
    );
    yield r'reasonCode';
    yield serializers.serialize(
      object.reasonCode,
      specifiedType: const FullType(MonthlyPreparedUnavailableSnapshotReasonCodeEnum),
    );
  }

  @override
  Object serialize(
    Serializers serializers,
    MonthlyPreparedUnavailableSnapshot object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required MonthlyPreparedUnavailableSnapshotBuilder result,
    required List<Object?> unhandled,
  }) {
    for (var i = 0; i < serializedList.length; i += 2) {
      final key = serializedList[i] as String;
      final value = serializedList[i + 1];
      switch (key) {
        case r'state':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(MonthlyPreparedUnavailableSnapshotStateEnum),
          ) as MonthlyPreparedUnavailableSnapshotStateEnum;
          result.state = valueDes;
          break;
        case r'reasonCode':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(MonthlyPreparedUnavailableSnapshotReasonCodeEnum),
          ) as MonthlyPreparedUnavailableSnapshotReasonCodeEnum;
          result.reasonCode = valueDes;
          break;
        default:
          unhandled.add(key);
          unhandled.add(value);
          break;
      }
    }
  }

  @override
  MonthlyPreparedUnavailableSnapshot deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = MonthlyPreparedUnavailableSnapshotBuilder();
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

class MonthlyPreparedUnavailableSnapshotStateEnum extends EnumClass {

  @BuiltValueEnumConst(wireName: r'unavailable')
  static const MonthlyPreparedUnavailableSnapshotStateEnum unavailable = _$monthlyPreparedUnavailableSnapshotStateEnum_unavailable;

  static Serializer<MonthlyPreparedUnavailableSnapshotStateEnum> get serializer => _$monthlyPreparedUnavailableSnapshotStateEnumSerializer;

  const MonthlyPreparedUnavailableSnapshotStateEnum._(String name): super(name);

  static BuiltSet<MonthlyPreparedUnavailableSnapshotStateEnum> get values => _$monthlyPreparedUnavailableSnapshotStateEnumValues;
  static MonthlyPreparedUnavailableSnapshotStateEnum valueOf(String name) => _$monthlyPreparedUnavailableSnapshotStateEnumValueOf(name);
}

class MonthlyPreparedUnavailableSnapshotReasonCodeEnum extends EnumClass {

  @BuiltValueEnumConst(wireName: r'activation_not_approved')
  static const MonthlyPreparedUnavailableSnapshotReasonCodeEnum activationNotApproved = _$monthlyPreparedUnavailableSnapshotReasonCodeEnum_activationNotApproved;

  static Serializer<MonthlyPreparedUnavailableSnapshotReasonCodeEnum> get serializer => _$monthlyPreparedUnavailableSnapshotReasonCodeEnumSerializer;

  const MonthlyPreparedUnavailableSnapshotReasonCodeEnum._(String name): super(name);

  static BuiltSet<MonthlyPreparedUnavailableSnapshotReasonCodeEnum> get values => _$monthlyPreparedUnavailableSnapshotReasonCodeEnumValues;
  static MonthlyPreparedUnavailableSnapshotReasonCodeEnum valueOf(String name) => _$monthlyPreparedUnavailableSnapshotReasonCodeEnumValueOf(name);
}
