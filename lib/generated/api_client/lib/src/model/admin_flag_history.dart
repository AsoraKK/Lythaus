//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:lythaus_api_client/src/model/admin_flag_history_admin_action.dart';
import 'package:built_collection/built_collection.dart';
import 'package:lythaus_api_client/src/model/admin_flag_history_flag.dart';
import 'package:lythaus_api_client/src/model/admin_flag_history_appeal.dart';
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'admin_flag_history.g.dart';

/// AdminFlagHistory
///
/// Properties:
/// * [flags]
/// * [adminActions]
/// * [appeal]
@BuiltValue()
abstract class AdminFlagHistory implements Built<AdminFlagHistory, AdminFlagHistoryBuilder> {
  @BuiltValueField(wireName: r'flags')
  BuiltList<AdminFlagHistoryFlag>? get flags;

  @BuiltValueField(wireName: r'adminActions')
  BuiltList<AdminFlagHistoryAdminAction>? get adminActions;

  @BuiltValueField(wireName: r'appeal')
  AdminFlagHistoryAppeal? get appeal;

  AdminFlagHistory._();

  factory AdminFlagHistory([void updates(AdminFlagHistoryBuilder b)]) = _$AdminFlagHistory;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(AdminFlagHistoryBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<AdminFlagHistory> get serializer => _$AdminFlagHistorySerializer();
}

class _$AdminFlagHistorySerializer implements PrimitiveSerializer<AdminFlagHistory> {
  @override
  final Iterable<Type> types = const [AdminFlagHistory, _$AdminFlagHistory];

  @override
  final String wireName = r'AdminFlagHistory';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    AdminFlagHistory object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    if (object.flags != null) {
      yield r'flags';
      yield serializers.serialize(
        object.flags,
        specifiedType: const FullType(BuiltList, [FullType(AdminFlagHistoryFlag)]),
      );
    }
    if (object.adminActions != null) {
      yield r'adminActions';
      yield serializers.serialize(
        object.adminActions,
        specifiedType: const FullType(BuiltList, [FullType(AdminFlagHistoryAdminAction)]),
      );
    }
    if (object.appeal != null) {
      yield r'appeal';
      yield serializers.serialize(
        object.appeal,
        specifiedType: const FullType(AdminFlagHistoryAppeal),
      );
    }
  }

  @override
  Object serialize(
    Serializers serializers,
    AdminFlagHistory object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required AdminFlagHistoryBuilder result,
    required List<Object?> unhandled,
  }) {
    for (var i = 0; i < serializedList.length; i += 2) {
      final key = serializedList[i] as String;
      final value = serializedList[i + 1];
      switch (key) {
        case r'flags':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(BuiltList, [FullType(AdminFlagHistoryFlag)]),
          ) as BuiltList<AdminFlagHistoryFlag>;
          result.flags.replace(valueDes);
          break;
        case r'adminActions':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(BuiltList, [FullType(AdminFlagHistoryAdminAction)]),
          ) as BuiltList<AdminFlagHistoryAdminAction>;
          result.adminActions.replace(valueDes);
          break;
        case r'appeal':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(AdminFlagHistoryAppeal),
          ) as AdminFlagHistoryAppeal;
          result.appeal.replace(valueDes);
          break;
        default:
          unhandled.add(key);
          unhandled.add(value);
          break;
      }
    }
  }

  @override
  AdminFlagHistory deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = AdminFlagHistoryBuilder();
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
