//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:lythaus_api_client/src/model/admin_invite_status.dart';
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'admin_invite.g.dart';

/// AdminInvite
///
/// Properties:
/// * [inviteId]
/// * [email]
/// * [createdBy]
/// * [createdAt]
/// * [expiresAt]
/// * [maxUses]
/// * [usageCount]
/// * [lastUsedAt]
/// * [status]
/// * [label]
/// * [usedByUserId]
@BuiltValue(instantiable: false)
abstract class AdminInvite  {
  @BuiltValueField(wireName: r'inviteId')
  String get inviteId;

  @BuiltValueField(wireName: r'email')
  String? get email;

  @BuiltValueField(wireName: r'createdBy')
  String? get createdBy;

  @BuiltValueField(wireName: r'createdAt')
  DateTime get createdAt;

  @BuiltValueField(wireName: r'expiresAt')
  DateTime get expiresAt;

  @BuiltValueField(wireName: r'maxUses')
  int get maxUses;

  @BuiltValueField(wireName: r'usageCount')
  int get usageCount;

  @BuiltValueField(wireName: r'lastUsedAt')
  DateTime? get lastUsedAt;

  @BuiltValueField(wireName: r'status')
  AdminInviteStatus get status;
  // enum statusEnum {  ACTIVE,  REVOKED,  EXHAUSTED,  };

  @BuiltValueField(wireName: r'label')
  String? get label;

  @BuiltValueField(wireName: r'usedByUserId')
  String? get usedByUserId;

  @BuiltValueSerializer(custom: true)
  static Serializer<AdminInvite> get serializer => _$AdminInviteSerializer();
}

class _$AdminInviteSerializer implements PrimitiveSerializer<AdminInvite> {
  @override
  final Iterable<Type> types = const [AdminInvite];

  @override
  final String wireName = r'AdminInvite';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    AdminInvite object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    yield r'inviteId';
    yield serializers.serialize(
      object.inviteId,
      specifiedType: const FullType(String),
    );
    if (object.email != null) {
      yield r'email';
      yield serializers.serialize(
        object.email,
        specifiedType: const FullType(String),
      );
    }
    if (object.createdBy != null) {
      yield r'createdBy';
      yield serializers.serialize(
        object.createdBy,
        specifiedType: const FullType(String),
      );
    }
    yield r'createdAt';
    yield serializers.serialize(
      object.createdAt,
      specifiedType: const FullType(DateTime),
    );
    yield r'expiresAt';
    yield serializers.serialize(
      object.expiresAt,
      specifiedType: const FullType(DateTime),
    );
    yield r'maxUses';
    yield serializers.serialize(
      object.maxUses,
      specifiedType: const FullType(int),
    );
    yield r'usageCount';
    yield serializers.serialize(
      object.usageCount,
      specifiedType: const FullType(int),
    );
    if (object.lastUsedAt != null) {
      yield r'lastUsedAt';
      yield serializers.serialize(
        object.lastUsedAt,
        specifiedType: const FullType(DateTime),
      );
    }
    yield r'status';
    yield serializers.serialize(
      object.status,
      specifiedType: const FullType(AdminInviteStatus),
    );
    if (object.label != null) {
      yield r'label';
      yield serializers.serialize(
        object.label,
        specifiedType: const FullType(String),
      );
    }
    if (object.usedByUserId != null) {
      yield r'usedByUserId';
      yield serializers.serialize(
        object.usedByUserId,
        specifiedType: const FullType(String),
      );
    }
  }

  @override
  Object serialize(
    Serializers serializers,
    AdminInvite object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  @override
  AdminInvite deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return serializers.deserialize(serialized, specifiedType: FullType($AdminInvite)) as $AdminInvite;
  }
}

/// a concrete implementation of [AdminInvite], since [AdminInvite] is not instantiable
@BuiltValue(instantiable: true)
abstract class $AdminInvite implements AdminInvite, Built<$AdminInvite, $AdminInviteBuilder> {
  $AdminInvite._();

  factory $AdminInvite([void Function($AdminInviteBuilder)? updates]) = _$$AdminInvite;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults($AdminInviteBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<$AdminInvite> get serializer => _$$AdminInviteSerializer();
}

class _$$AdminInviteSerializer implements PrimitiveSerializer<$AdminInvite> {
  @override
  final Iterable<Type> types = const [$AdminInvite, _$$AdminInvite];

  @override
  final String wireName = r'$AdminInvite';

  @override
  Object serialize(
    Serializers serializers,
    $AdminInvite object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return serializers.serialize(object, specifiedType: FullType(AdminInvite))!;
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required AdminInviteBuilder result,
    required List<Object?> unhandled,
  }) {
    for (var i = 0; i < serializedList.length; i += 2) {
      final key = serializedList[i] as String;
      final value = serializedList[i + 1];
      switch (key) {
        case r'inviteId':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.inviteId = valueDes;
          break;
        case r'email':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.email = valueDes;
          break;
        case r'createdBy':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.createdBy = valueDes;
          break;
        case r'createdAt':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(DateTime),
          ) as DateTime;
          result.createdAt = valueDes;
          break;
        case r'expiresAt':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(DateTime),
          ) as DateTime;
          result.expiresAt = valueDes;
          break;
        case r'maxUses':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(int),
          ) as int;
          result.maxUses = valueDes;
          break;
        case r'usageCount':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(int),
          ) as int;
          result.usageCount = valueDes;
          break;
        case r'lastUsedAt':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(DateTime),
          ) as DateTime;
          result.lastUsedAt = valueDes;
          break;
        case r'status':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(AdminInviteStatus),
          ) as AdminInviteStatus;
          result.status = valueDes;
          break;
        case r'label':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.label = valueDes;
          break;
        case r'usedByUserId':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.usedByUserId = valueDes;
          break;
        default:
          unhandled.add(key);
          unhandled.add(value);
          break;
      }
    }
  }

  @override
  $AdminInvite deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = $AdminInviteBuilder();
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
