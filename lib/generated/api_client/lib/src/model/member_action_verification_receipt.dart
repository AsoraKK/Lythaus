//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:built_collection/built_collection.dart';
import 'package:built_value/json_object.dart';
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'member_action_verification_receipt.g.dart';

/// MemberActionVerificationReceipt
///
/// Properties:
/// * [proof] - Opaque one-use proof, bound to this account/session/action/request. Send only to the intended API in X-Lythaus-Action-Verification; do not persist, log or forward on redirects.
/// * [verifiedAt]
/// * [expiresAt] - Exactly five minutes after verifiedAt, enforced using server DB time.
/// * [action]
/// * [maintenanceEvidence] - Optional evidence-collection outcome only. Inactive or unavailable collection never implies monthly eligibility, protection coverage, a point award or a reputation deduction.
@BuiltValue()
abstract class MemberActionVerificationReceipt implements Built<MemberActionVerificationReceipt, MemberActionVerificationReceiptBuilder> {
  /// Opaque one-use proof, bound to this account/session/action/request. Send only to the intended API in X-Lythaus-Action-Verification; do not persist, log or forward on redirects.
  @BuiltValueField(wireName: r'proof')
  String get proof;

  @BuiltValueField(wireName: r'verifiedAt')
  DateTime get verifiedAt;

  /// Exactly five minutes after verifiedAt, enforced using server DB time.
  @BuiltValueField(wireName: r'expiresAt')
  DateTime get expiresAt;

  @BuiltValueField(wireName: r'action')
  MemberActionVerificationReceiptActionEnum get action;
  // enum actionEnum {  reward_claim,  account_delete,  };

  /// Optional evidence-collection outcome only. Inactive or unavailable collection never implies monthly eligibility, protection coverage, a point award or a reputation deduction.
  @BuiltValueField(wireName: r'maintenanceEvidence')
  BuiltMap<String, JsonObject?> get maintenanceEvidence;

  MemberActionVerificationReceipt._();

  factory MemberActionVerificationReceipt([void updates(MemberActionVerificationReceiptBuilder b)]) = _$MemberActionVerificationReceipt;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(MemberActionVerificationReceiptBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<MemberActionVerificationReceipt> get serializer => _$MemberActionVerificationReceiptSerializer();
}

class _$MemberActionVerificationReceiptSerializer implements PrimitiveSerializer<MemberActionVerificationReceipt> {
  @override
  final Iterable<Type> types = const [MemberActionVerificationReceipt, _$MemberActionVerificationReceipt];

  @override
  final String wireName = r'MemberActionVerificationReceipt';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    MemberActionVerificationReceipt object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    yield r'proof';
    yield serializers.serialize(
      object.proof,
      specifiedType: const FullType(String),
    );
    yield r'verifiedAt';
    yield serializers.serialize(
      object.verifiedAt,
      specifiedType: const FullType(DateTime),
    );
    yield r'expiresAt';
    yield serializers.serialize(
      object.expiresAt,
      specifiedType: const FullType(DateTime),
    );
    yield r'action';
    yield serializers.serialize(
      object.action,
      specifiedType: const FullType(MemberActionVerificationReceiptActionEnum),
    );
    yield r'maintenanceEvidence';
    yield serializers.serialize(
      object.maintenanceEvidence,
      specifiedType: const FullType(BuiltMap, [FullType(String), FullType.nullable(JsonObject)]),
    );
  }

  @override
  Object serialize(
    Serializers serializers,
    MemberActionVerificationReceipt object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required MemberActionVerificationReceiptBuilder result,
    required List<Object?> unhandled,
  }) {
    for (var i = 0; i < serializedList.length; i += 2) {
      final key = serializedList[i] as String;
      final value = serializedList[i + 1];
      switch (key) {
        case r'proof':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.proof = valueDes;
          break;
        case r'verifiedAt':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(DateTime),
          ) as DateTime;
          result.verifiedAt = valueDes;
          break;
        case r'expiresAt':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(DateTime),
          ) as DateTime;
          result.expiresAt = valueDes;
          break;
        case r'action':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(MemberActionVerificationReceiptActionEnum),
          ) as MemberActionVerificationReceiptActionEnum;
          result.action = valueDes;
          break;
        case r'maintenanceEvidence':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(BuiltMap, [FullType(String), FullType.nullable(JsonObject)]),
          ) as BuiltMap<String, JsonObject?>;
          result.maintenanceEvidence.replace(valueDes);
          break;
        default:
          unhandled.add(key);
          unhandled.add(value);
          break;
      }
    }
  }

  @override
  MemberActionVerificationReceipt deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = MemberActionVerificationReceiptBuilder();
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

class MemberActionVerificationReceiptActionEnum extends EnumClass {

  @BuiltValueEnumConst(wireName: r'reward_claim')
  static const MemberActionVerificationReceiptActionEnum rewardClaim = _$memberActionVerificationReceiptActionEnum_rewardClaim;
  @BuiltValueEnumConst(wireName: r'account_delete')
  static const MemberActionVerificationReceiptActionEnum accountDelete = _$memberActionVerificationReceiptActionEnum_accountDelete;

  static Serializer<MemberActionVerificationReceiptActionEnum> get serializer => _$memberActionVerificationReceiptActionEnumSerializer;

  const MemberActionVerificationReceiptActionEnum._(String name): super(name);

  static BuiltSet<MemberActionVerificationReceiptActionEnum> get values => _$memberActionVerificationReceiptActionEnumValues;
  static MemberActionVerificationReceiptActionEnum valueOf(String name) => _$memberActionVerificationReceiptActionEnumValueOf(name);
}
