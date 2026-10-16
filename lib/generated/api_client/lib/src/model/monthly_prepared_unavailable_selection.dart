//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:built_collection/built_collection.dart';
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'monthly_prepared_unavailable_selection.g.dart';

/// MonthlyPreparedUnavailableSelection
///
/// Properties:
/// * [state]
/// * [reasonCode]
@BuiltValue()
abstract class MonthlyPreparedUnavailableSelection implements Built<MonthlyPreparedUnavailableSelection, MonthlyPreparedUnavailableSelectionBuilder> {
  @BuiltValueField(wireName: r'state')
  MonthlyPreparedUnavailableSelectionStateEnum get state;
  // enum stateEnum {  unavailable,  };

  @BuiltValueField(wireName: r'reasonCode')
  MonthlyPreparedUnavailableSelectionReasonCodeEnum get reasonCode;
  // enum reasonCodeEnum {  approval_unavailable,  };

  MonthlyPreparedUnavailableSelection._();

  factory MonthlyPreparedUnavailableSelection([void updates(MonthlyPreparedUnavailableSelectionBuilder b)]) = _$MonthlyPreparedUnavailableSelection;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(MonthlyPreparedUnavailableSelectionBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<MonthlyPreparedUnavailableSelection> get serializer => _$MonthlyPreparedUnavailableSelectionSerializer();
}

class _$MonthlyPreparedUnavailableSelectionSerializer implements PrimitiveSerializer<MonthlyPreparedUnavailableSelection> {
  @override
  final Iterable<Type> types = const [MonthlyPreparedUnavailableSelection, _$MonthlyPreparedUnavailableSelection];

  @override
  final String wireName = r'MonthlyPreparedUnavailableSelection';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    MonthlyPreparedUnavailableSelection object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    yield r'state';
    yield serializers.serialize(
      object.state,
      specifiedType: const FullType(MonthlyPreparedUnavailableSelectionStateEnum),
    );
    yield r'reasonCode';
    yield serializers.serialize(
      object.reasonCode,
      specifiedType: const FullType(MonthlyPreparedUnavailableSelectionReasonCodeEnum),
    );
  }

  @override
  Object serialize(
    Serializers serializers,
    MonthlyPreparedUnavailableSelection object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required MonthlyPreparedUnavailableSelectionBuilder result,
    required List<Object?> unhandled,
  }) {
    for (var i = 0; i < serializedList.length; i += 2) {
      final key = serializedList[i] as String;
      final value = serializedList[i + 1];
      switch (key) {
        case r'state':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(MonthlyPreparedUnavailableSelectionStateEnum),
          ) as MonthlyPreparedUnavailableSelectionStateEnum;
          result.state = valueDes;
          break;
        case r'reasonCode':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(MonthlyPreparedUnavailableSelectionReasonCodeEnum),
          ) as MonthlyPreparedUnavailableSelectionReasonCodeEnum;
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
  MonthlyPreparedUnavailableSelection deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = MonthlyPreparedUnavailableSelectionBuilder();
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

class MonthlyPreparedUnavailableSelectionStateEnum extends EnumClass {

  @BuiltValueEnumConst(wireName: r'unavailable')
  static const MonthlyPreparedUnavailableSelectionStateEnum unavailable = _$monthlyPreparedUnavailableSelectionStateEnum_unavailable;

  static Serializer<MonthlyPreparedUnavailableSelectionStateEnum> get serializer => _$monthlyPreparedUnavailableSelectionStateEnumSerializer;

  const MonthlyPreparedUnavailableSelectionStateEnum._(String name): super(name);

  static BuiltSet<MonthlyPreparedUnavailableSelectionStateEnum> get values => _$monthlyPreparedUnavailableSelectionStateEnumValues;
  static MonthlyPreparedUnavailableSelectionStateEnum valueOf(String name) => _$monthlyPreparedUnavailableSelectionStateEnumValueOf(name);
}

class MonthlyPreparedUnavailableSelectionReasonCodeEnum extends EnumClass {

  @BuiltValueEnumConst(wireName: r'approval_unavailable')
  static const MonthlyPreparedUnavailableSelectionReasonCodeEnum approvalUnavailable = _$monthlyPreparedUnavailableSelectionReasonCodeEnum_approvalUnavailable;

  static Serializer<MonthlyPreparedUnavailableSelectionReasonCodeEnum> get serializer => _$monthlyPreparedUnavailableSelectionReasonCodeEnumSerializer;

  const MonthlyPreparedUnavailableSelectionReasonCodeEnum._(String name): super(name);

  static BuiltSet<MonthlyPreparedUnavailableSelectionReasonCodeEnum> get values => _$monthlyPreparedUnavailableSelectionReasonCodeEnumValues;
  static MonthlyPreparedUnavailableSelectionReasonCodeEnum valueOf(String name) => _$monthlyPreparedUnavailableSelectionReasonCodeEnumValueOf(name);
}
