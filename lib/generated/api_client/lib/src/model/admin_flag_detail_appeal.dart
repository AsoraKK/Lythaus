//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:lythaus_api_client/src/model/admin_appeal_status.dart';
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'admin_flag_detail_appeal.g.dart';

/// AdminFlagDetailAppeal
///
/// Properties:
/// * [appealId]
/// * [status]
/// * [submittedAt]
/// * [updatedAt]
@BuiltValue()
abstract class AdminFlagDetailAppeal implements Built<AdminFlagDetailAppeal, AdminFlagDetailAppealBuilder> {
  @BuiltValueField(wireName: r'appealId')
  String? get appealId;

  @BuiltValueField(wireName: r'status')
  AdminAppealStatus? get status;
  // enum statusEnum {  PENDING,  APPROVED,  REJECTED,  OVERRIDDEN,  };

  @BuiltValueField(wireName: r'submittedAt')
  DateTime? get submittedAt;

  @BuiltValueField(wireName: r'updatedAt')
  DateTime? get updatedAt;

  AdminFlagDetailAppeal._();

  factory AdminFlagDetailAppeal([void updates(AdminFlagDetailAppealBuilder b)]) = _$AdminFlagDetailAppeal;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(AdminFlagDetailAppealBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<AdminFlagDetailAppeal> get serializer => _$AdminFlagDetailAppealSerializer();
}

class _$AdminFlagDetailAppealSerializer implements PrimitiveSerializer<AdminFlagDetailAppeal> {
  @override
  final Iterable<Type> types = const [AdminFlagDetailAppeal, _$AdminFlagDetailAppeal];

  @override
  final String wireName = r'AdminFlagDetailAppeal';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    AdminFlagDetailAppeal object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    if (object.appealId != null) {
      yield r'appealId';
      yield serializers.serialize(
        object.appealId,
        specifiedType: const FullType(String),
      );
    }
    if (object.status != null) {
      yield r'status';
      yield serializers.serialize(
        object.status,
        specifiedType: const FullType(AdminAppealStatus),
      );
    }
    if (object.submittedAt != null) {
      yield r'submittedAt';
      yield serializers.serialize(
        object.submittedAt,
        specifiedType: const FullType(DateTime),
      );
    }
    if (object.updatedAt != null) {
      yield r'updatedAt';
      yield serializers.serialize(
        object.updatedAt,
        specifiedType: const FullType(DateTime),
      );
    }
  }

  @override
  Object serialize(
    Serializers serializers,
    AdminFlagDetailAppeal object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required AdminFlagDetailAppealBuilder result,
    required List<Object?> unhandled,
  }) {
    for (var i = 0; i < serializedList.length; i += 2) {
      final key = serializedList[i] as String;
      final value = serializedList[i + 1];
      switch (key) {
        case r'appealId':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.appealId = valueDes;
          break;
        case r'status':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(AdminAppealStatus),
          ) as AdminAppealStatus;
          result.status = valueDes;
          break;
        case r'submittedAt':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(DateTime),
          ) as DateTime;
          result.submittedAt = valueDes;
          break;
        case r'updatedAt':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(DateTime),
          ) as DateTime;
          result.updatedAt = valueDes;
          break;
        default:
          unhandled.add(key);
          unhandled.add(value);
          break;
      }
    }
  }

  @override
  AdminFlagDetailAppeal deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = AdminFlagDetailAppealBuilder();
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
