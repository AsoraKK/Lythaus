//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:lythaus_api_client/src/model/admin_flag_detail_reason.dart';
import 'package:built_collection/built_collection.dart';
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'admin_flag_detail_flags.g.dart';

/// AdminFlagDetailFlags
///
/// Properties:
/// * [flagId]
/// * [status]
/// * [flagCount]
/// * [reporterCount]
/// * [reasons]
@BuiltValue()
abstract class AdminFlagDetailFlags implements Built<AdminFlagDetailFlags, AdminFlagDetailFlagsBuilder> {
  @BuiltValueField(wireName: r'flagId')
  String? get flagId;

  @BuiltValueField(wireName: r'status')
  String? get status;

  @BuiltValueField(wireName: r'flagCount')
  int? get flagCount;

  @BuiltValueField(wireName: r'reporterCount')
  int? get reporterCount;

  @BuiltValueField(wireName: r'reasons')
  BuiltList<AdminFlagDetailReason>? get reasons;

  AdminFlagDetailFlags._();

  factory AdminFlagDetailFlags([void updates(AdminFlagDetailFlagsBuilder b)]) = _$AdminFlagDetailFlags;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(AdminFlagDetailFlagsBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<AdminFlagDetailFlags> get serializer => _$AdminFlagDetailFlagsSerializer();
}

class _$AdminFlagDetailFlagsSerializer implements PrimitiveSerializer<AdminFlagDetailFlags> {
  @override
  final Iterable<Type> types = const [AdminFlagDetailFlags, _$AdminFlagDetailFlags];

  @override
  final String wireName = r'AdminFlagDetailFlags';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    AdminFlagDetailFlags object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    if (object.flagId != null) {
      yield r'flagId';
      yield serializers.serialize(
        object.flagId,
        specifiedType: const FullType(String),
      );
    }
    if (object.status != null) {
      yield r'status';
      yield serializers.serialize(
        object.status,
        specifiedType: const FullType(String),
      );
    }
    if (object.flagCount != null) {
      yield r'flagCount';
      yield serializers.serialize(
        object.flagCount,
        specifiedType: const FullType(int),
      );
    }
    if (object.reporterCount != null) {
      yield r'reporterCount';
      yield serializers.serialize(
        object.reporterCount,
        specifiedType: const FullType(int),
      );
    }
    if (object.reasons != null) {
      yield r'reasons';
      yield serializers.serialize(
        object.reasons,
        specifiedType: const FullType(BuiltList, [FullType(AdminFlagDetailReason)]),
      );
    }
  }

  @override
  Object serialize(
    Serializers serializers,
    AdminFlagDetailFlags object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required AdminFlagDetailFlagsBuilder result,
    required List<Object?> unhandled,
  }) {
    for (var i = 0; i < serializedList.length; i += 2) {
      final key = serializedList[i] as String;
      final value = serializedList[i + 1];
      switch (key) {
        case r'flagId':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.flagId = valueDes;
          break;
        case r'status':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.status = valueDes;
          break;
        case r'flagCount':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(int),
          ) as int;
          result.flagCount = valueDes;
          break;
        case r'reporterCount':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(int),
          ) as int;
          result.reporterCount = valueDes;
          break;
        case r'reasons':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(BuiltList, [FullType(AdminFlagDetailReason)]),
          ) as BuiltList<AdminFlagDetailReason>;
          result.reasons.replace(valueDes);
          break;
        default:
          unhandled.add(key);
          unhandled.add(value);
          break;
      }
    }
  }

  @override
  AdminFlagDetailFlags deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = AdminFlagDetailFlagsBuilder();
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
