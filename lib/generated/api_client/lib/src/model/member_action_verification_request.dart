//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:lythaus_api_client/src/model/member_action_verification_request_operation.dart';
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'member_action_verification_request.g.dart';

/// MemberActionVerificationRequest
///
/// Properties:
/// * [password] - Existing account password, unchanged and unnormalized. Login compatibility applies; this is not password creation or enrollment.
/// * [operation]
@BuiltValue()
abstract class MemberActionVerificationRequest implements Built<MemberActionVerificationRequest, MemberActionVerificationRequestBuilder> {
  /// Existing account password, unchanged and unnormalized. Login compatibility applies; this is not password creation or enrollment.
  @BuiltValueField(wireName: r'password')
  String get password;

  @BuiltValueField(wireName: r'operation')
  MemberActionVerificationRequestOperation get operation;

  MemberActionVerificationRequest._();

  factory MemberActionVerificationRequest([void updates(MemberActionVerificationRequestBuilder b)]) = _$MemberActionVerificationRequest;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(MemberActionVerificationRequestBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<MemberActionVerificationRequest> get serializer => _$MemberActionVerificationRequestSerializer();
}

class _$MemberActionVerificationRequestSerializer implements PrimitiveSerializer<MemberActionVerificationRequest> {
  @override
  final Iterable<Type> types = const [MemberActionVerificationRequest, _$MemberActionVerificationRequest];

  @override
  final String wireName = r'MemberActionVerificationRequest';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    MemberActionVerificationRequest object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    yield r'password';
    yield serializers.serialize(
      object.password,
      specifiedType: const FullType(String),
    );
    yield r'operation';
    yield serializers.serialize(
      object.operation,
      specifiedType: const FullType(MemberActionVerificationRequestOperation),
    );
  }

  @override
  Object serialize(
    Serializers serializers,
    MemberActionVerificationRequest object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required MemberActionVerificationRequestBuilder result,
    required List<Object?> unhandled,
  }) {
    for (var i = 0; i < serializedList.length; i += 2) {
      final key = serializedList[i] as String;
      final value = serializedList[i + 1];
      switch (key) {
        case r'password':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.password = valueDes;
          break;
        case r'operation':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(MemberActionVerificationRequestOperation),
          ) as MemberActionVerificationRequestOperation;
          result.operation.replace(valueDes);
          break;
        default:
          unhandled.add(key);
          unhandled.add(value);
          break;
      }
    }
  }

  @override
  MemberActionVerificationRequest deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = MemberActionVerificationRequestBuilder();
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
