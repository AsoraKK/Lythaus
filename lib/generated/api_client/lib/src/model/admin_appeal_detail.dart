//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:lythaus_api_client/src/model/admin_appeal_status_detail.dart';
import 'package:built_collection/built_collection.dart';
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'admin_appeal_detail.g.dart';

/// AdminAppealDetail
///
/// Properties:
/// * [appealId]
/// * [contentId]
/// * [authorId]
/// * [submittedAt]
/// * [status]
/// * [appealType]
/// * [appealReason]
/// * [userStatement]
/// * [evidenceUrls]
/// * [internalNote]
/// * [votesFor]
/// * [votesAgainst]
/// * [totalVotes]
/// * [votingStatus]
/// * [expiresAt]
/// * [timeRemainingSeconds]
@BuiltValue()
abstract class AdminAppealDetail implements Built<AdminAppealDetail, AdminAppealDetailBuilder> {
  @BuiltValueField(wireName: r'appealId')
  String? get appealId;

  @BuiltValueField(wireName: r'contentId')
  String? get contentId;

  @BuiltValueField(wireName: r'authorId')
  String? get authorId;

  @BuiltValueField(wireName: r'submittedAt')
  DateTime? get submittedAt;

  @BuiltValueField(wireName: r'status')
  AdminAppealStatusDetail? get status;
  // enum statusEnum {  pending,  approved,  rejected,  overridden,  };

  @BuiltValueField(wireName: r'appealType')
  String? get appealType;

  @BuiltValueField(wireName: r'appealReason')
  String? get appealReason;

  @BuiltValueField(wireName: r'userStatement')
  String? get userStatement;

  @BuiltValueField(wireName: r'evidenceUrls')
  BuiltList<String>? get evidenceUrls;

  @BuiltValueField(wireName: r'internalNote')
  String? get internalNote;

  @BuiltValueField(wireName: r'votesFor')
  int? get votesFor;

  @BuiltValueField(wireName: r'votesAgainst')
  int? get votesAgainst;

  @BuiltValueField(wireName: r'totalVotes')
  int? get totalVotes;

  @BuiltValueField(wireName: r'votingStatus')
  String? get votingStatus;

  @BuiltValueField(wireName: r'expiresAt')
  DateTime? get expiresAt;

  @BuiltValueField(wireName: r'timeRemainingSeconds')
  int? get timeRemainingSeconds;

  AdminAppealDetail._();

  factory AdminAppealDetail([void updates(AdminAppealDetailBuilder b)]) = _$AdminAppealDetail;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(AdminAppealDetailBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<AdminAppealDetail> get serializer => _$AdminAppealDetailSerializer();
}

class _$AdminAppealDetailSerializer implements PrimitiveSerializer<AdminAppealDetail> {
  @override
  final Iterable<Type> types = const [AdminAppealDetail, _$AdminAppealDetail];

  @override
  final String wireName = r'AdminAppealDetail';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    AdminAppealDetail object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    if (object.appealId != null) {
      yield r'appealId';
      yield serializers.serialize(
        object.appealId,
        specifiedType: const FullType(String),
      );
    }
    if (object.contentId != null) {
      yield r'contentId';
      yield serializers.serialize(
        object.contentId,
        specifiedType: const FullType(String),
      );
    }
    if (object.authorId != null) {
      yield r'authorId';
      yield serializers.serialize(
        object.authorId,
        specifiedType: const FullType(String),
      );
    }
    if (object.submittedAt != null) {
      yield r'submittedAt';
      yield serializers.serialize(
        object.submittedAt,
        specifiedType: const FullType(DateTime),
      );
    }
    if (object.status != null) {
      yield r'status';
      yield serializers.serialize(
        object.status,
        specifiedType: const FullType(AdminAppealStatusDetail),
      );
    }
    if (object.appealType != null) {
      yield r'appealType';
      yield serializers.serialize(
        object.appealType,
        specifiedType: const FullType(String),
      );
    }
    if (object.appealReason != null) {
      yield r'appealReason';
      yield serializers.serialize(
        object.appealReason,
        specifiedType: const FullType(String),
      );
    }
    if (object.userStatement != null) {
      yield r'userStatement';
      yield serializers.serialize(
        object.userStatement,
        specifiedType: const FullType(String),
      );
    }
    if (object.evidenceUrls != null) {
      yield r'evidenceUrls';
      yield serializers.serialize(
        object.evidenceUrls,
        specifiedType: const FullType(BuiltList, [FullType(String)]),
      );
    }
    if (object.internalNote != null) {
      yield r'internalNote';
      yield serializers.serialize(
        object.internalNote,
        specifiedType: const FullType(String),
      );
    }
    if (object.votesFor != null) {
      yield r'votesFor';
      yield serializers.serialize(
        object.votesFor,
        specifiedType: const FullType(int),
      );
    }
    if (object.votesAgainst != null) {
      yield r'votesAgainst';
      yield serializers.serialize(
        object.votesAgainst,
        specifiedType: const FullType(int),
      );
    }
    if (object.totalVotes != null) {
      yield r'totalVotes';
      yield serializers.serialize(
        object.totalVotes,
        specifiedType: const FullType(int),
      );
    }
    if (object.votingStatus != null) {
      yield r'votingStatus';
      yield serializers.serialize(
        object.votingStatus,
        specifiedType: const FullType.nullable(String),
      );
    }
    if (object.expiresAt != null) {
      yield r'expiresAt';
      yield serializers.serialize(
        object.expiresAt,
        specifiedType: const FullType.nullable(DateTime),
      );
    }
    if (object.timeRemainingSeconds != null) {
      yield r'timeRemainingSeconds';
      yield serializers.serialize(
        object.timeRemainingSeconds,
        specifiedType: const FullType.nullable(int),
      );
    }
  }

  @override
  Object serialize(
    Serializers serializers,
    AdminAppealDetail object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required AdminAppealDetailBuilder result,
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
        case r'contentId':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.contentId = valueDes;
          break;
        case r'authorId':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.authorId = valueDes;
          break;
        case r'submittedAt':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(DateTime),
          ) as DateTime;
          result.submittedAt = valueDes;
          break;
        case r'status':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(AdminAppealStatusDetail),
          ) as AdminAppealStatusDetail;
          result.status = valueDes;
          break;
        case r'appealType':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.appealType = valueDes;
          break;
        case r'appealReason':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.appealReason = valueDes;
          break;
        case r'userStatement':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.userStatement = valueDes;
          break;
        case r'evidenceUrls':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(BuiltList, [FullType(String)]),
          ) as BuiltList<String>;
          result.evidenceUrls.replace(valueDes);
          break;
        case r'internalNote':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.internalNote = valueDes;
          break;
        case r'votesFor':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(int),
          ) as int;
          result.votesFor = valueDes;
          break;
        case r'votesAgainst':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(int),
          ) as int;
          result.votesAgainst = valueDes;
          break;
        case r'totalVotes':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(int),
          ) as int;
          result.totalVotes = valueDes;
          break;
        case r'votingStatus':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType.nullable(String),
          ) as String?;
          if (valueDes == null) continue;
          result.votingStatus = valueDes;
          break;
        case r'expiresAt':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType.nullable(DateTime),
          ) as DateTime?;
          if (valueDes == null) continue;
          result.expiresAt = valueDes;
          break;
        case r'timeRemainingSeconds':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType.nullable(int),
          ) as int?;
          if (valueDes == null) continue;
          result.timeRemainingSeconds = valueDes;
          break;
        default:
          unhandled.add(key);
          unhandled.add(value);
          break;
      }
    }
  }

  @override
  AdminAppealDetail deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = AdminAppealDetailBuilder();
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
