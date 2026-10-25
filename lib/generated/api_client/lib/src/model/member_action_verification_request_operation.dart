//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:built_collection/built_collection.dart';
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'member_action_verification_request_operation.g.dart';

/// MemberActionVerificationRequestOperation
///
/// Properties:
/// * [method]
/// * [path] - Exact canonical /api path and query of the intended reward redemption or privacy deletion request. Actor, action and session identity are derived by the server.
/// * [body] - Exact UTF-8 body text used by the mutation, at most 8192 bytes. Reward redemption may use an empty body; privacy deletion uses requestType delete JSON. Whitespace, property order and query bytes are bound to the proof.
@BuiltValue()
abstract class MemberActionVerificationRequestOperation implements Built<MemberActionVerificationRequestOperation, MemberActionVerificationRequestOperationBuilder> {
  @BuiltValueField(wireName: r'method')
  MemberActionVerificationRequestOperationMethodEnum get method;
  // enum methodEnum {  POST,  };

  /// Exact canonical /api path and query of the intended reward redemption or privacy deletion request. Actor, action and session identity are derived by the server.
  @BuiltValueField(wireName: r'path')
  String get path;

  /// Exact UTF-8 body text used by the mutation, at most 8192 bytes. Reward redemption may use an empty body; privacy deletion uses requestType delete JSON. Whitespace, property order and query bytes are bound to the proof.
  @BuiltValueField(wireName: r'body')
  String get body;

  MemberActionVerificationRequestOperation._();

  factory MemberActionVerificationRequestOperation([void updates(MemberActionVerificationRequestOperationBuilder b)]) = _$MemberActionVerificationRequestOperation;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(MemberActionVerificationRequestOperationBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<MemberActionVerificationRequestOperation> get serializer => _$MemberActionVerificationRequestOperationSerializer();
}

class _$MemberActionVerificationRequestOperationSerializer implements PrimitiveSerializer<MemberActionVerificationRequestOperation> {
  @override
  final Iterable<Type> types = const [MemberActionVerificationRequestOperation, _$MemberActionVerificationRequestOperation];

  @override
  final String wireName = r'MemberActionVerificationRequestOperation';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    MemberActionVerificationRequestOperation object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    yield r'method';
    yield serializers.serialize(
      object.method,
      specifiedType: const FullType(MemberActionVerificationRequestOperationMethodEnum),
    );
    yield r'path';
    yield serializers.serialize(
      object.path,
      specifiedType: const FullType(String),
    );
    yield r'body';
    yield serializers.serialize(
      object.body,
      specifiedType: const FullType(String),
    );
  }

  @override
  Object serialize(
    Serializers serializers,
    MemberActionVerificationRequestOperation object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required MemberActionVerificationRequestOperationBuilder result,
    required List<Object?> unhandled,
  }) {
    for (var i = 0; i < serializedList.length; i += 2) {
      final key = serializedList[i] as String;
      final value = serializedList[i + 1];
      switch (key) {
        case r'method':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(MemberActionVerificationRequestOperationMethodEnum),
          ) as MemberActionVerificationRequestOperationMethodEnum;
          result.method = valueDes;
          break;
        case r'path':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.path = valueDes;
          break;
        case r'body':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.body = valueDes;
          break;
        default:
          unhandled.add(key);
          unhandled.add(value);
          break;
      }
    }
  }

  @override
  MemberActionVerificationRequestOperation deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = MemberActionVerificationRequestOperationBuilder();
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

class MemberActionVerificationRequestOperationMethodEnum extends EnumClass {

  @BuiltValueEnumConst(wireName: r'POST')
  static const MemberActionVerificationRequestOperationMethodEnum POST = _$memberActionVerificationRequestOperationMethodEnum_POST;

  static Serializer<MemberActionVerificationRequestOperationMethodEnum> get serializer => _$memberActionVerificationRequestOperationMethodEnumSerializer;

  const MemberActionVerificationRequestOperationMethodEnum._(String name): super(name);

  static BuiltSet<MemberActionVerificationRequestOperationMethodEnum> get values => _$memberActionVerificationRequestOperationMethodEnumValues;
  static MemberActionVerificationRequestOperationMethodEnum valueOf(String name) => _$memberActionVerificationRequestOperationMethodEnumValueOf(name);
}
