//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:lythaus_api_client/src/model/admin_appeal_status.dart';
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'admin_flag_history_appeal.g.dart';

/// AdminFlagHistoryAppeal
///
/// Properties:
/// * [type]
/// * [at]
/// * [status]
@BuiltValue()
abstract class AdminFlagHistoryAppeal implements Built<AdminFlagHistoryAppeal, AdminFlagHistoryAppealBuilder> {
  @BuiltValueField(wireName: r'type')
  String? get type;

  @BuiltValueField(wireName: r'at')
  DateTime? get at;

  @BuiltValueField(wireName: r'status')
  AdminAppealStatus? get status;
  // enum statusEnum {  PENDING,  APPROVED,  REJECTED,  OVERRIDDEN,  };

  AdminFlagHistoryAppeal._();

  factory AdminFlagHistoryAppeal([void updates(AdminFlagHistoryAppealBuilder b)]) = _$AdminFlagHistoryAppeal;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(AdminFlagHistoryAppealBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<AdminFlagHistoryAppeal> get serializer => _$AdminFlagHistoryAppealSerializer();
}

class _$AdminFlagHistoryAppealSerializer implements PrimitiveSerializer<AdminFlagHistoryAppeal> {
  @override
  final Iterable<Type> types = const [AdminFlagHistoryAppeal, _$AdminFlagHistoryAppeal];

  @override
  final String wireName = r'AdminFlagHistoryAppeal';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    AdminFlagHistoryAppeal object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    if (object.type != null) {
      yield r'type';
      yield serializers.serialize(
        object.type,
        specifiedType: const FullType(String),
      );
    }
    if (object.at != null) {
      yield r'at';
      yield serializers.serialize(
        object.at,
        specifiedType: const FullType(DateTime),
      );
    }
    if (object.status != null) {
      yield r'status';
      yield serializers.serialize(
        object.status,
        specifiedType: const FullType(AdminAppealStatus),
      );
    }
  }

  @override
  Object serialize(
    Serializers serializers,
    AdminFlagHistoryAppeal object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required AdminFlagHistoryAppealBuilder result,
    required List<Object?> unhandled,
  }) {
    for (var i = 0; i < serializedList.length; i += 2) {
      final key = serializedList[i] as String;
      final value = serializedList[i + 1];
      switch (key) {
        case r'type':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.type = valueDes;
          break;
        case r'at':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(DateTime),
          ) as DateTime;
          result.at = valueDes;
          break;
        case r'status':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(AdminAppealStatus),
          ) as AdminAppealStatus;
          result.status = valueDes;
          break;
        default:
          unhandled.add(key);
          unhandled.add(value);
          break;
      }
    }
  }

  @override
  AdminFlagHistoryAppeal deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = AdminFlagHistoryAppealBuilder();
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
